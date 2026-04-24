import type {
  TaxonomyFile,
  ValidationIssue,
  Attribute,
  Category,
  Vocabulary,
  Status
} from "./types.ts";

const STATUS_VALUES: Status[] = ["active", "deprecated"];
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const MERGE_STRATEGIES = ["union", "intersection", "priority"] as const;

export function validateTaxonomy(doc: TaxonomyFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  validateSchemaVersion(doc, issues);
  validateStatusValues(doc, issues);
  validateRuleConfig(doc, issues);

  const categoriesById = new Map(doc.categories.map((c) => [c.id, c]));
  const attributesByKey = new Map(doc.attributes.map((a) => [a.key, a]));
  const vocabularyById = new Map(doc.vocabularies.map((v) => [v.id, v]));

  validateUnique(doc.categories.map((c) => c.id), "C_ID_DUPLICATE", "Duplicate category id", "categories[].id", issues);
  validateUnique(doc.categories.map((c) => c.search_path), "C_PATH_DUPLICATE", "Duplicate category search_path", "categories[].search_path", issues);
  validateUnique(doc.attributes.map((a) => a.key), "A_KEY_DUPLICATE", "Duplicate attribute key", "attributes[].key", issues);
  validateUnique(doc.vocabularies.map((v) => v.id), "V_ID_DUPLICATE", "Duplicate vocabulary id", "vocabularies[].id", issues);

  validateCategoryTree(doc.categories, categoriesById, issues);
  validateSearchPaths(doc.categories, issues);
  validateAttributes(doc.attributes, vocabularyById, issues);
  validateVocabularies(doc.vocabularies, issues);
  validateBindings(doc.categories, attributesByKey, vocabularyById, issues);
  validateEntityModel(doc, issues);

  return issues;
}

function validateEntityModel(doc: TaxonomyFile, issues: ValidationIssue[]) {
  const entityModel = doc.entity_model;
  if (!entityModel) return;

  validateUnique(
    entityModel.entity_types.map((e) => e.id),
    "E_TYPE_DUPLICATE",
    "Duplicate entity type id",
    "entity_model.entity_types[].id",
    issues
  );
  validateUnique(
    entityModel.relation_types.map((r) => r.id),
    "E_RELATION_DUPLICATE",
    "Duplicate relation type id",
    "entity_model.relation_types[].id",
    issues
  );

  const entityTypeById = new Map(entityModel.entity_types.map((e) => [e.id, e]));
  for (const [i, entityType] of entityModel.entity_types.entries()) {
    ensureStatus(entityType.status, `entity_model.entity_types[${i}].status`, issues);
  }

  for (const [i, relationType] of entityModel.relation_types.entries()) {
    ensureStatus(relationType.status, `entity_model.relation_types[${i}].status`, issues);
    if (!entityTypeById.has(relationType.from_entity_type)) {
      issues.push({
        level: "ERROR",
        code: "E_RELATION_FROM_UNKNOWN",
        message: `Relation '${relationType.id}' references unknown from_entity_type '${relationType.from_entity_type}'`,
        path: `entity_model.relation_types[${i}].from_entity_type`
      });
    }
    if (!entityTypeById.has(relationType.to_entity_type)) {
      issues.push({
        level: "ERROR",
        code: "E_RELATION_TO_UNKNOWN",
        message: `Relation '${relationType.id}' references unknown to_entity_type '${relationType.to_entity_type}'`,
        path: `entity_model.relation_types[${i}].to_entity_type`
      });
    }
  }
}

function validateRuleConfig(doc: TaxonomyFile, issues: ValidationIssue[]) {
  const mc = doc.rules.multi_category;
  if (!mc) {
    issues.push({
      level: "ERROR",
      code: "R_MULTI_CATEGORY_MISSING",
      message: "rules.multi_category is required",
      path: "rules.multi_category"
    });
    return;
  }

  if (!Number.isInteger(mc.max_categories_per_photo) || mc.max_categories_per_photo < 1 || mc.max_categories_per_photo > 3) {
    issues.push({
      level: "ERROR",
      code: "R_MULTI_CATEGORY_MAX",
      message: "rules.multi_category.max_categories_per_photo must be an integer between 1 and 3",
      path: "rules.multi_category.max_categories_per_photo"
    });
  }

  if (!MERGE_STRATEGIES.includes(mc.attribute_merge_strategy)) {
    issues.push({
      level: "ERROR",
      code: "R_MULTI_CATEGORY_STRATEGY",
      message: "rules.multi_category.attribute_merge_strategy must be one of: union | intersection | priority",
      path: "rules.multi_category.attribute_merge_strategy"
    });
  }
}

function validateSchemaVersion(doc: TaxonomyFile, issues: ValidationIssue[]) {
  if (!SEMVER_REGEX.test(doc.schema_version)) {
    issues.push({
      level: "ERROR",
      code: "R_SCHEMA_VERSION",
      message: `schema_version must be SemVer (e.g. 2.0.0), got '${doc.schema_version}'`,
      path: "schema_version"
    });
  }
}

function validateStatusValues(doc: TaxonomyFile, issues: ValidationIssue[]) {
  for (const [i, attr] of doc.attributes.entries()) {
    ensureStatus(attr.status, `attributes[${i}].status`, issues);
  }
  for (const [i, cat] of doc.categories.entries()) {
    ensureStatus(cat.status, `categories[${i}].status`, issues);
    for (const [j, binding] of cat.attribute_bindings.entries()) {
      ensureStatus(binding.status, `categories[${i}].attribute_bindings[${j}].status`, issues);
    }
  }
  for (const [i, vocab] of doc.vocabularies.entries()) {
    ensureStatus(vocab.status, `vocabularies[${i}].status`, issues);
    for (const [j, term] of vocab.terms.entries()) {
      ensureStatus(term.status, `vocabularies[${i}].terms[${j}].status`, issues);
    }
  }
}

function ensureStatus(status: string, path: string, issues: ValidationIssue[]) {
  if (!STATUS_VALUES.includes(status as Status)) {
    issues.push({
      level: "ERROR",
      code: "R_STATUS_INVALID",
      message: `Invalid status '${status}'. Allowed: active | deprecated`,
      path
    });
  }
}

function validateUnique(values: string[], code: string, message: string, path: string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      issues.push({ level: "ERROR", code, message: `${message}: ${value}`, path });
    }
    seen.add(value);
  }
}

function validateCategoryTree(categories: Category[], categoriesById: Map<string, Category>, issues: ValidationIssue[]) {
  for (const [i, category] of categories.entries()) {
    if (category.parent_id === category.id) {
      issues.push({
        level: "ERROR",
        code: "C_SELF_PARENT",
        message: `Category '${category.id}' cannot reference itself as parent`,
        path: `categories[${i}].parent_id`
      });
    }

    if (category.parent_id && !categoriesById.has(category.parent_id)) {
      issues.push({
        level: "ERROR",
        code: "C_PARENT_NOT_FOUND",
        message: `Category '${category.id}' parent_id '${category.parent_id}' not found`,
        path: `categories[${i}].parent_id`
      });
    }

    if (category.parent_id) {
      const parent = categoriesById.get(category.parent_id);
      if (parent?.status === "deprecated" && category.status === "active") {
        issues.push({
          level: "WARNING",
          code: "C_PARENT_DEPRECATED",
          message: `Category '${category.id}' is active while parent '${parent.id}' is deprecated`,
          path: `categories[${i}].status`
        });
      }
    }
  }

  detectCycles(categories, categoriesById, issues);
}

function detectCycles(categories: Category[], categoriesById: Map<string, Category>, issues: ValidationIssue[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (categoryId: string) => {
    if (visiting.has(categoryId)) {
      issues.push({
        level: "ERROR",
        code: "C_CYCLE",
        message: `Category cycle detected at '${categoryId}'`,
        path: "categories"
      });
      return;
    }

    if (visited.has(categoryId)) return;

    visiting.add(categoryId);
    const node = categoriesById.get(categoryId);
    if (node?.parent_id) {
      dfs(node.parent_id);
    }
    visiting.delete(categoryId);
    visited.add(categoryId);
  };

  for (const category of categories) {
    dfs(category.id);
  }
}

function validateSearchPaths(categories: Category[], issues: ValidationIssue[]) {
  for (const [i, category] of categories.entries()) {
    const path = category.search_path;
    if (path.startsWith("/") || path.endsWith("/")) {
      issues.push({
        level: "ERROR",
        code: "C_PATH_SLASH",
        message: `search_path cannot start/end with '/': '${path}'`,
        path: `categories[${i}].search_path`
      });
    }

    if (path.includes("//")) {
      issues.push({
        level: "ERROR",
        code: "C_PATH_DOUBLE_SLASH",
        message: `search_path cannot contain '//': '${path}'`,
        path: `categories[${i}].search_path`
      });
    }
  }
}

function validateAttributes(attributes: Attribute[], vocabularyById: Map<string, Vocabulary>, issues: ValidationIssue[]) {
  for (const [i, attribute] of attributes.entries()) {
    if (attribute.type === "enum") {
      if (!attribute.vocab_ref) {
        issues.push({
          level: "ERROR",
          code: "A_ENUM_NO_VOCAB",
          message: `Enum attribute '${attribute.key}' must define vocab_ref`,
          path: `attributes[${i}].vocab_ref`
        });
      } else if (!vocabularyById.has(attribute.vocab_ref)) {
        issues.push({
          level: "ERROR",
          code: "A_VOCAB_NOT_FOUND",
          message: `Attribute '${attribute.key}' references missing vocabulary '${attribute.vocab_ref}'`,
          path: `attributes[${i}].vocab_ref`
        });
      }
    } else if (attribute.vocab_ref) {
      issues.push({
        level: "ERROR",
        code: "A_NON_ENUM_HAS_VOCAB",
        message: `Non-enum attribute '${attribute.key}' must not define vocab_ref`,
        path: `attributes[${i}].vocab_ref`
      });
    }
  }
}

function validateVocabularies(vocabularies: Vocabulary[], issues: ValidationIssue[]) {
  for (const [vocabIdx, vocab] of vocabularies.entries()) {
    const termSet = new Set<string>();
    const aliasMap = new Map<string, string>();

    for (const [termIdx, term] of vocab.terms.entries()) {
      const termKey = normalize(term.value);
      if (termSet.has(termKey)) {
        issues.push({
          level: "ERROR",
          code: "V_TERM_DUPLICATE",
          message: `Vocabulary '${vocab.id}' has duplicate term '${term.value}'`,
          path: `vocabularies[${vocabIdx}].terms[${termIdx}].value`
        });
      }
      termSet.add(termKey);

      for (const alias of term.aliases ?? []) {
        const aliasKey = normalize(alias);
        if (termSet.has(aliasKey)) {
          issues.push({
            level: "ERROR",
            code: "V_ALIAS_CONFLICT_TERM",
            message: `Alias '${alias}' conflicts with a canonical term in '${vocab.id}'`,
            path: `vocabularies[${vocabIdx}].terms[${termIdx}].aliases`
          });
        }

        const mapped = aliasMap.get(aliasKey);
        if (mapped && mapped !== term.value) {
          issues.push({
            level: "ERROR",
            code: "V_ALIAS_DUPLICATE",
            message: `Alias '${alias}' maps to multiple terms in '${vocab.id}'`,
            path: `vocabularies[${vocabIdx}].terms[${termIdx}].aliases`
          });
        }

        aliasMap.set(aliasKey, term.value);
      }
    }
  }
}

function validateBindings(
  categories: Category[],
  attributesByKey: Map<string, Attribute>,
  vocabularyById: Map<string, Vocabulary>,
  issues: ValidationIssue[]
) {
  for (const [catIdx, category] of categories.entries()) {
    const bindingKeys = new Set<string>();

    for (const [bindIdx, binding] of category.attribute_bindings.entries()) {
      if (bindingKeys.has(binding.key)) {
        issues.push({
          level: "ERROR",
          code: "B_DUPLICATE_KEY",
          message: `Category '${category.id}' has duplicate binding key '${binding.key}'`,
          path: `categories[${catIdx}].attribute_bindings[${bindIdx}].key`
        });
      }
      bindingKeys.add(binding.key);

      const attribute = attributesByKey.get(binding.key);
      if (!attribute) {
        issues.push({
          level: "ERROR",
          code: "B_ATTR_NOT_FOUND",
          message: `Category '${category.id}' references missing attribute '${binding.key}'`,
          path: `categories[${catIdx}].attribute_bindings[${bindIdx}].key`
        });
        continue;
      }

      if (attribute.status === "deprecated") {
        issues.push({
          level: "WARNING",
          code: "B_ATTR_DEPRECATED",
          message: `Category '${category.id}' uses deprecated attribute '${binding.key}'`,
          path: `categories[${catIdx}].attribute_bindings[${bindIdx}].key`
        });
      }

      const allowedTerms = binding.override?.allowed_terms;
      if (allowedTerms?.length) {
        if (attribute.type !== "enum" || !attribute.vocab_ref) {
          issues.push({
            level: "ERROR",
            code: "B_OVERRIDE_NON_ENUM",
            message: "allowed_terms override is only valid for enum attributes with vocab_ref",
            path: `categories[${catIdx}].attribute_bindings[${bindIdx}].override.allowed_terms`
          });
          continue;
        }

        const vocab = vocabularyById.get(attribute.vocab_ref);
        if (!vocab) continue;

        const terms = new Set(vocab.terms.map((term) => normalize(term.value)));
        for (const term of allowedTerms) {
          if (!terms.has(normalize(term))) {
            issues.push({
              level: "ERROR",
              code: "B_OVERRIDE_TERM_UNKNOWN",
              message: `Unknown term '${term}' for vocab '${vocab.id}'`,
              path: `categories[${catIdx}].attribute_bindings[${bindIdx}].override.allowed_terms`
            });
          }
        }
      }
    }
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFC");
}
