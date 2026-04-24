export type Status = "active" | "deprecated";

export interface TaxonomyFile {
  schema_version: string;
  meta: {
    name: string;
    updated_at: string;
  };
  vocabularies: Vocabulary[];
  attributes: Attribute[];
  categories: Category[];
  normalization: Normalization;
  rules: Rules;
}

export interface Vocabulary {
  id: string;
  status: Status;
  terms: VocabularyTerm[];
}

export interface VocabularyTerm {
  value: string;
  status: Status;
  aliases?: string[];
}

export interface Attribute {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  cardinality: "single" | "multi";
  status: Status;
  aliases?: string[];
  vocab_ref?: string;
}

export interface AttributeBinding {
  key: string;
  required: boolean;
  status: Status;
  override?: {
    allowed_terms?: string[];
  };
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  search_path: string;
  status: Status;
  aliases?: string[];
  inherit_attributes: boolean;
  attribute_bindings: AttributeBinding[];
}

export interface Normalization {
  case_insensitive: boolean;
  trim_whitespace: boolean;
  unicode_normalization: "NFC" | "NFD" | "NFKC" | "NFKD";
  alias_resolution_order: Array<"attribute_alias" | "category_alias" | "vocabulary_term_alias">;
  deprecated_policy: {
    accept_input: boolean;
    store_as_canonical_if_possible: boolean;
    warn_on_use: boolean;
  };
}

export interface Rules {
  id_unique: boolean;
  attribute_key_unique: boolean;
  search_path_unique: boolean;
  child_override_parent: boolean;
  status_values: Status[];
}

export type ValidationLevel = "ERROR" | "WARNING" | "INFO";

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  path?: string;
}
