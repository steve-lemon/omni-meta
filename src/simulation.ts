import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile, Category, Attribute } from "./types.ts";
import { validateTaxonomy } from "./validator.ts";

type PhotoRecord = {
  id: string;
  category_id: string;
  metadata: Record<string, string | string[]>;
};

type QueryInput = {
  category?: string;
  filters: Record<string, string | string[]>;
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

function effectiveBindingKeys(categoryId: string, taxonomy: TaxonomyFile): Set<string> {
  const lineage = resolveCategoryLineage(categoryId, taxonomy);
  const keys = new Set<string>();

  for (const cat of lineage) {
    if (!cat.inherit_attributes) keys.clear();
    for (const binding of cat.attribute_bindings) {
      if (binding.status === "active") keys.add(binding.key);
    }
  }

  return keys;
}

function normalizeQuery(query: QueryInput, taxonomy: TaxonomyFile): QueryInput {
  const out: QueryInput = { filters: {} };
  if (query.category) {
    out.category = canonicalizeCategory(query.category, taxonomy)?.id ?? query.category;
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

  return out;
}

function includesAll(recordValues: string[], wanted: string[]): boolean {
  const set = new Set(recordValues.map(normalize));
  return wanted.every((v) => set.has(normalize(v)));
}

function matchesPhoto(photo: PhotoRecord, query: QueryInput, taxonomy: TaxonomyFile): boolean {
  if (query.category && photo.category_id !== query.category) return false;

  const allowedKeys = effectiveBindingKeys(photo.category_id, taxonomy);

  for (const [k, wanted] of Object.entries(query.filters)) {
    if (!allowedKeys.has(k)) return false;

    const actual = photo.metadata[k];
    if (actual === undefined) return false;

    const wantedArray = Array.isArray(wanted) ? wanted : [wanted];
    const actualArray = Array.isArray(actual) ? actual : [actual];

    if (!includesAll(actualArray, wantedArray)) return false;
  }

  return true;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFC");
}

function main() {
  const taxonomy = loadJson<TaxonomyFile>("examples/valid-taxonomy.json");
  const photos = loadJson<PhotoRecord[]>("examples/fashion-photos.json");

  const issues = validateTaxonomy(taxonomy);
  const errors = issues.filter((i) => i.level === "ERROR");
  if (errors.length > 0) {
    console.error("Taxonomy has blocking errors; simulation aborted.");
    process.exit(2);
  }

  const scenarios: Array<{ name: string; query: QueryInput; note: string }> = [
    {
      name: "S1 - 기본 정밀 검색",
      query: {
        category: "fashion/tops/shirt",
        filters: { model: "mina", top_type: "shirt", style: ["minimal"] }
      },
      note: "카테고리 + 모델 + 상의 타입 + 스타일"
    },
    {
      name: "S2 - alias 정규화 검색",
      query: {
        category: "셔츠",
        filters: { person: "mina", upper_type: "tee", 스타일: ["미니멀"] }
      },
      note: "category/attribute/value alias를 canonical로 정규화"
    },
    {
      name: "S3 - 다중 스타일 교집합 검색",
      query: {
        category: "fashion/tops/shirt",
        filters: { style: ["minimal", "casual"] }
      },
      note: "multi cardinality 속성에서 복수 조건 만족"
    }
  ];

  console.log("=== Fashion Model Photo Metadata Simulation ===");
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
