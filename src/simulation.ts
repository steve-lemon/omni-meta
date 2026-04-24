import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile, Category, Attribute, AttributeBinding, AttributeMergeStrategy } from "./types.ts";
import { validateTaxonomy } from "./validator.ts";

type PhotoRecord = {
  id: string;
  category_ids: string[];
  metadata: Record<string, string | string[]>;
  entities?: PhotoEntity[];
  relations?: PhotoRelation[];
};

type QueryInput = {
  categories?: string[];
  filters: Record<string, string | string[]>;
  entity_filters?: EntityFilter[];
  relation_filters?: RelationFilter[];
};

type PhotoEntity = {
  id: string;
  type: string;
  category_ids: string[];
  attributes: Record<string, string | string[]>;
};

type PhotoRelation = {
  type: string;
  from_entity_id: string;
  to_entity_id: string;
};

type EntityFilter = {
  type?: string;
  categories?: string[];
  attributes?: Record<string, string | string[]>;
};

type RelationFilter = {
  type: string;
  from_type?: string;
  to_type?: string;
};

type EffectiveBinding = {
  key: string;
  allowedTerms?: Set<string>;
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function canonicalizeCategory(input: string, taxonomy: TaxonomyFile): Category | undefined {
  const normalized = normalize(input);
  return taxonomy.categories.find((c) => {
    if (normalize(c.id) === normalized) return true;
    if (normalize(c.name) === normalized) return true;
    if (normalize(c.search_path) === normalized) return true;
    return (c.aliases ?? []).some((a) => normalize(a) === normalized);
  });
}

function canonicalizeAttributeKey(inputKey: string, taxonomy: TaxonomyFile): Attribute | undefined {
  const normalized = normalize(inputKey);
  return taxonomy.attributes.find((a) => {
    if (normalize(a.key) === normalized) return true;
    return (a.aliases ?? []).some((alias) => normalize(alias) === normalized);
  });
}

function canonicalizeEnumValue(attribute: Attribute, rawValue: string, taxonomy: TaxonomyFile): string {
  if (attribute.type !== "enum" || !attribute.vocab_ref) return rawValue;
  const vocab = taxonomy.vocabularies.find((v) => v.id === attribute.vocab_ref);
  if (!vocab) return rawValue;

  const normalized = normalize(rawValue);
  for (const term of vocab.terms) {
    if (normalize(term.value) === normalized) return term.value;
    for (const alias of term.aliases ?? []) {
      if (normalize(alias) === normalized) return term.value;
    }
  }

  return rawValue;
}

function resolveCategoryLineage(categoryId: string, taxonomy: TaxonomyFile): Category[] {
  const byId = new Map(taxonomy.categories.map((c) => [c.id, c]));
  const chain: Category[] = [];
  let cursor = byId.get(categoryId);

  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }

  return chain;
}

function toAllowedTerms(binding: AttributeBinding): Set<string> | undefined {
  const terms = binding.override?.allowed_terms;
  if (!terms?.length) return undefined;
  return new Set(terms.map(normalize));
}

function mergeAllowedTerms(
  base: Set<string> | undefined,
  next: Set<string> | undefined,
  strategy: "union" | "intersection"
): Set<string> | undefined {
  if (!base) return next;
  if (!next) return base;

  if (strategy === "union") {
    return new Set([...base, ...next]);
  }

  const out = new Set<string>();
  for (const v of base) {
    if (next.has(v)) out.add(v);
  }
  return out;
}

function bindingMapForCategory(categoryId: string, taxonomy: TaxonomyFile): Map<string, EffectiveBinding> {
  const lineage = resolveCategoryLineage(categoryId, taxonomy);
  const map = new Map<string, EffectiveBinding>();

  for (const cat of lineage) {
    if (!cat.inherit_attributes) map.clear();

    for (const binding of cat.attribute_bindings) {
      if (binding.status !== "active") continue;

      const key = binding.key;
      const incomingAllowed = toAllowedTerms(binding);
      const prev = map.get(key);

      if (!prev) {
        map.set(key, { key, allowedTerms: incomingAllowed });
        continue;
      }

      map.set(key, {
        key,
        allowedTerms: mergeAllowedTerms(prev.allowedTerms, incomingAllowed, "intersection")
      });
    }
  }

  return map;
}

function mergeBindingMaps(
  maps: Map<string, EffectiveBinding>[],
  strategy: AttributeMergeStrategy
): Map<string, EffectiveBinding> {
  if (maps.length === 0) return new Map();
  if (strategy === "priority") return maps[0];

  const out = new Map<string, EffectiveBinding>();

  if (strategy === "union") {
    for (const m of maps) {
      for (const [key, binding] of m.entries()) {
        const prev = out.get(key);
        out.set(key, {
          key,
          allowedTerms: mergeAllowedTerms(prev?.allowedTerms, binding.allowedTerms, "union")
        });
      }
    }
    return out;
  }

  const sharedKeys = new Set(maps[0].keys());
  for (const m of maps.slice(1)) {
    for (const key of [...sharedKeys]) {
      if (!m.has(key)) sharedKeys.delete(key);
    }
  }

  for (const key of sharedKeys) {
    let allowedTerms: Set<string> | undefined;
    for (const m of maps) {
      const binding = m.get(key);
      if (!binding) continue;
      allowedTerms = mergeAllowedTerms(allowedTerms, binding.allowedTerms, "intersection");
    }
    out.set(key, { key, allowedTerms });
  }

  return out;
}

function effectiveBindingMapForPhoto(photo: PhotoRecord, taxonomy: TaxonomyFile): Map<string, EffectiveBinding> {
  const maxAllowed = taxonomy.rules.multi_category.max_categories_per_photo;
  if (photo.category_ids.length === 0) {
    throw new Error(`Photo '${photo.id}' must have at least one category.`);
  }
  if (photo.category_ids.length > maxAllowed) {
    throw new Error(`Photo '${photo.id}' has ${photo.category_ids.length} categories (max ${maxAllowed}).`);
  }

  const categoryMaps = photo.category_ids.map((categoryId) => bindingMapForCategory(categoryId, taxonomy));
  return mergeBindingMaps(categoryMaps, taxonomy.rules.multi_category.attribute_merge_strategy);
}

function normalizeQuery(query: QueryInput, taxonomy: TaxonomyFile): QueryInput {
  const out: QueryInput = { filters: {} };
  if (query.categories?.length) {
    out.categories = query.categories.map((cat) => canonicalizeCategory(cat, taxonomy)?.id ?? cat);
  }

  for (const [key, value] of Object.entries(query.filters)) {
    const attr = canonicalizeAttributeKey(key, taxonomy);
    const canonicalKey = attr?.key ?? key;

    if (Array.isArray(value)) {
      out.filters[canonicalKey] = value.map((v) => (attr ? canonicalizeEnumValue(attr, v, taxonomy) : v));
    } else {
      out.filters[canonicalKey] = attr ? canonicalizeEnumValue(attr, value, taxonomy) : value;
    }
  }

  if (query.entity_filters?.length) {
    out.entity_filters = query.entity_filters.map((filter) => ({
      ...filter,
      categories: filter.categories?.map((cat) => canonicalizeCategory(cat, taxonomy)?.id ?? cat)
    }));
  }
  if (query.relation_filters?.length) {
    out.relation_filters = query.relation_filters;
  }

  return out;
}

function includesAll(recordValues: string[], wanted: string[]): boolean {
  const set = new Set(recordValues.map(normalize));
  return wanted.every((v) => set.has(normalize(v)));
}

function matchesPhoto(photo: PhotoRecord, query: QueryInput, taxonomy: TaxonomyFile): boolean {
  if (query.categories?.length) {
    for (const queryCategory of query.categories) {
      if (!photo.category_ids.includes(queryCategory)) return false;
    }
  }

  const bindingMap = effectiveBindingMapForPhoto(photo, taxonomy);

  for (const [k, wanted] of Object.entries(query.filters)) {
    const binding = bindingMap.get(k);
    if (!binding) return false;

    const actual = photo.metadata[k];
    if (actual === undefined) return false;

    const wantedArray = Array.isArray(wanted) ? wanted : [wanted];
    const actualArray = Array.isArray(actual) ? actual : [actual];

    if (binding.allowedTerms && binding.allowedTerms.size > 0) {
      for (const val of actualArray) {
        if (!binding.allowedTerms.has(normalize(val))) return false;
      }
      for (const val of wantedArray) {
        if (!binding.allowedTerms.has(normalize(val))) return false;
      }
    }

    if (!includesAll(actualArray, wantedArray)) return false;
  }

  if (query.entity_filters?.length && !matchesEntityFilters(photo, query.entity_filters)) {
    return false;
  }

  if (query.relation_filters?.length && !matchesRelationFilters(photo, query.relation_filters)) {
    return false;
  }

  return true;
}

function matchesEntityFilters(photo: PhotoRecord, entityFilters: EntityFilter[]): boolean {
  const entities = photo.entities ?? [];
  for (const filter of entityFilters) {
    const hit = entities.some((entity) => matchesSingleEntityFilter(entity, filter));
    if (!hit) return false;
  }
  return true;
}

function matchesSingleEntityFilter(entity: PhotoEntity, filter: EntityFilter): boolean {
  if (filter.type && normalize(filter.type) !== normalize(entity.type)) return false;
  if (filter.categories?.length) {
    for (const categoryId of filter.categories) {
      if (!entity.category_ids.includes(categoryId)) return false;
    }
  }
  if (!filter.attributes) return true;

  for (const [key, wanted] of Object.entries(filter.attributes)) {
    const actual = entity.attributes[key];
    if (actual === undefined) return false;
    const actualArray = Array.isArray(actual) ? actual : [actual];
    const wantedArray = Array.isArray(wanted) ? wanted : [wanted];
    if (!includesAll(actualArray, wantedArray)) return false;
  }
  return true;
}

function matchesRelationFilters(photo: PhotoRecord, relationFilters: RelationFilter[]): boolean {
  const relations = photo.relations ?? [];
  const entityById = new Map((photo.entities ?? []).map((e) => [e.id, e]));

  for (const filter of relationFilters) {
    const hit = relations.some((relation) => {
      if (normalize(relation.type) !== normalize(filter.type)) return false;
      const from = entityById.get(relation.from_entity_id);
      const to = entityById.get(relation.to_entity_id);
      if (!from || !to) return false;
      if (filter.from_type && normalize(from.type) !== normalize(filter.from_type)) return false;
      if (filter.to_type && normalize(to.type) !== normalize(filter.to_type)) return false;
      return true;
    });
    if (!hit) return false;
  }

  return true;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFC");
}

function effectiveBindingMapForEntity(entity: PhotoEntity, taxonomy: TaxonomyFile): Map<string, EffectiveBinding> {
  const maxAllowed = 3;
  if (entity.category_ids.length === 0) {
    throw new Error(`Entity '${entity.id}' must have at least one category.`);
  }
  if (entity.category_ids.length > maxAllowed) {
    throw new Error(`Entity '${entity.id}' has ${entity.category_ids.length} categories (max ${maxAllowed}).`);
  }

  const categoryMaps = entity.category_ids.map((categoryId) => bindingMapForCategory(categoryId, taxonomy));
  return mergeBindingMaps(categoryMaps, taxonomy.rules.multi_category.attribute_merge_strategy);
}

function validateEntityAttributes(photo: PhotoRecord, taxonomy: TaxonomyFile): void {
  const attributeByKey = new Map(taxonomy.attributes.map((a) => [a.key, a]));
  const vocabularyById = new Map(taxonomy.vocabularies.map((v) => [v.id, v]));

  for (const entity of photo.entities ?? []) {
    const bindingMap = effectiveBindingMapForEntity(entity, taxonomy);
    for (const [key, rawValue] of Object.entries(entity.attributes)) {
      const binding = bindingMap.get(key);
      if (!binding) {
        throw new Error(`Photo '${photo.id}' entity '${entity.id}' uses '${key}' not allowed by entity categories.`);
      }

      const attribute = attributeByKey.get(key);
      if (!attribute) continue;

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (attribute.type === "enum" && attribute.vocab_ref) {
        const vocab = vocabularyById.get(attribute.vocab_ref);
        if (!vocab) continue;
        const vocabTerms = new Set(vocab.terms.map((term) => normalize(term.value)));

        for (const val of values) {
          const normalized = normalize(val);
          if (!vocabTerms.has(normalized)) {
            throw new Error(
              `Photo '${photo.id}' entity '${entity.id}' has enum value '${val}' not in vocabulary '${vocab.id}'.`
            );
          }
          if (binding.allowedTerms && binding.allowedTerms.size > 0 && !binding.allowedTerms.has(normalized)) {
            throw new Error(
              `Photo '${photo.id}' entity '${entity.id}' value '${val}' is outside allowed_terms for '${key}'.`
            );
          }
        }
      }
    }
  }
}

function main() {
  const taxonomyPath = process.argv[2] ?? "examples/fashion.json";
  const photosPath = process.argv[3] ?? "examples/fashion-photos.json";
  const taxonomy = loadJson<TaxonomyFile>(taxonomyPath);
  const photos = loadJson<PhotoRecord[]>(photosPath);

  const issues = validateTaxonomy(taxonomy);
  const errors = issues.filter((i) => i.level === "ERROR");
  if (errors.length > 0) {
    console.error("Taxonomy has blocking errors; simulation aborted.");
    process.exit(2);
  }

  for (const photo of photos) {
    validateEntityAttributes(photo, taxonomy);
  }

  const scenarios: Array<{ name: string; query: QueryInput; note: string }> = [
    {
      name: "S1 - 기본 정밀 검색",
      query: {
        categories: ["fashion/tops/shirt"],
        filters: { model: "mina", top_type: "shirt", style: ["minimal"] }
      },
      note: "단일 카테고리 + 속성 조건"
    },
    {
      name: "S2 - 멀티 카테고리(공통 속성 intersection)",
      query: {
        categories: ["fashion/tops/shirt", "fashion/tops"],
        filters: { style: ["minimal"], top_type: "shirt" }
      },
      note: "복수 카테고리 지정 시 공통 적용 가능한 속성으로만 검색"
    },
    {
      name: "S3 - alias 정규화 검색",
      query: {
        categories: ["셔츠"],
        filters: { person: "mina", upper_type: "shirt", 스타일: ["미니멀"] }
      },
      note: "category/attribute/value alias 정규화"
    },
    {
      name: "S4 - 엔터티/관계 기반 검색",
      query: {
        categories: ["fashion"],
        filters: { style: ["minimal"] },
        entity_filters: [
          { type: "dress", categories: ["fashion/dress"], attributes: { garment_type: "slip_dress" } },
          { type: "footwear", categories: ["fashion/footwear"], attributes: { footwear_type: "loafer" } }
        ],
        relation_filters: [{ type: "wears", from_type: "model", to_type: "dress" }]
      },
      note: "한 사진 내 복수 엔터티 + 관계(모델이 드레스를 착용) 검색"
    }
  ];

  console.log("=== Fashion Model Photo Metadata Simulation (Multi-category) ===");
  console.log(`Merge strategy: ${taxonomy.rules.multi_category.attribute_merge_strategy}`);
  console.log(`Max categories per photo: ${taxonomy.rules.multi_category.max_categories_per_photo}`);
  console.log(`Total photos: ${photos.length}`);

  for (const scenario of scenarios) {
    const normalizedQuery = normalizeQuery(scenario.query, taxonomy);
    const matched = photos.filter((p) => matchesPhoto(p, normalizedQuery, taxonomy));

    console.log(`\n[${scenario.name}] ${scenario.note}`);
    console.log(`Query(raw): ${JSON.stringify(scenario.query)}`);
    console.log(`Query(normalized): ${JSON.stringify(normalizedQuery)}`);
    console.log(`Matched: ${matched.length}`);
    console.log(`Photo IDs: ${matched.map((m) => m.id).join(", ") || "(none)"}`);
  }

  console.log("\nSimulation completed.");
}

main();
