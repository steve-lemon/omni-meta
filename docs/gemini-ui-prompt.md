# Gemini UI Prompt for React Code Generation

아래 프롬프트는 `gemini-pro`가 설계 설명에 머무르지 않고, 실제로 React 기반 관리웹 코드를 생성하도록 유도하기 위한 버전이다.

## Prompt

```text
You are a senior React + TypeScript engineer building a production-quality internal admin tool.

Generate implementation-oriented React code for a Taxonomy Management Web App.

Your output should optimize for code generation, not abstract product advice.
Prefer concrete file structure, components, hooks, utilities, types, and sample code.

==================================================
1. Goal
==================================================

Build a React-based internal management console for editing a `TaxonomyFile` JSON document.

This web app is used to:
- select a bundle at startup
- load a taxonomy bundle
- inspect and edit its structure safely
- validate cross-reference relationships
- save the edited result back

The UI must be relationship-aware, not just a raw JSON editor.

==================================================
2. Backend API Contract
==================================================

Use only these APIs:

- `loadJson(keyPath): Promise<any>`
- `saveJson(keyPath, data): Promise<void>`
- `listBundles(): Promise<string[]>`

Assume:
- the app starts by calling `listBundles()`
- the user selects one bundle
- the app loads that bundle with `loadJson(selectedKeyPath)`
- the user edits the data
- the app saves with `saveJson(selectedKeyPath, editedData)`

Do not invent a different backend contract.

==================================================
3. Required Tech Choices
==================================================

Use the following stack:

- React
- TypeScript
- Vite
- Zustand for editor/app state
- React Hook Form for detail forms where useful
- Zod for schema-friendly validation helpers
- TanStack Query only for async loading/mutation orchestration if needed
- CSS Modules or scoped CSS with clean admin styling

Do not use Redux.
Do not use a heavy component framework unless absolutely necessary.
Prefer custom admin components that are practical and maintainable.

==================================================
4. Domain Model
==================================================

Use this exact domain model:

```ts
type Status = "active" | "deprecated";
type AttributeMergeStrategy = "union" | "intersection" | "priority";

interface TaxonomyFile {
  schema_version: string;
  meta: {
    name: string;
    updated_at: string;
  };
  vocabularies: Vocabulary[];
  attributes: Attribute[];
  categories: Category[];
  entity_model?: EntityModel;
  normalization: Normalization;
  rules: Rules;
}

interface EntityModel {
  entity_types: EntityTypeDefinition[];
  relation_types: RelationTypeDefinition[];
}

interface EntityTypeDefinition {
  id: string;
  label: string;
  status: Status;
  aliases?: string[];
}

interface RelationTypeDefinition {
  id: string;
  label: string;
  status: Status;
  from_entity_type: string;
  to_entity_type: string;
  aliases?: string[];
}

interface Vocabulary {
  id: string;
  status: Status;
  terms: VocabularyTerm[];
}

interface VocabularyTerm {
  value: string;
  status: Status;
  aliases?: string[];
}

interface Attribute {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  cardinality: "single" | "multi";
  status: Status;
  aliases?: string[];
  vocab_ref?: string;
}

interface AttributeBinding {
  key: string;
  required: boolean;
  status: Status;
  override?: {
    allowed_terms?: string[];
  };
}

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  search_path: string;
  status: Status;
  aliases?: string[];
  inherit_attributes: boolean;
  attribute_bindings: AttributeBinding[];
}

interface Normalization {
  case_insensitive: boolean;
  trim_whitespace: boolean;
  unicode_normalization: "NFC" | "NFD" | "NFKC" | "NFKD";
  alias_resolution_order: Array<
    "attribute_alias" | "category_alias" | "vocabulary_term_alias"
  >;
  deprecated_policy: {
    accept_input: boolean;
    store_as_canonical_if_possible: boolean;
    warn_on_use: boolean;
  };
}

interface Rules {
  id_unique: boolean;
  attribute_key_unique: boolean;
  search_path_unique: boolean;
  child_override_parent: boolean;
  status_values: Status[];
  multi_category: {
    enabled: boolean;
    max_categories_per_photo: number;
    attribute_merge_strategy: AttributeMergeStrategy;
  };
}
```

==================================================
5. Relationship Rules the UI Must Understand
==================================================

The generated app must understand these relationships:

1. Vocabulary -> Attribute
- enum attributes must use `vocab_ref`
- non-enum attributes must not use `vocab_ref`
- vocabulary usage should be visible from the vocabulary detail panel

2. Attribute -> Category Binding
- category binding `key` must reference an existing attribute key
- binding `override.allowed_terms` only applies to enum attributes with vocabularies
- allowed terms must be subset of the referenced vocabulary terms
- if a bound attribute is deprecated, show a warning

3. Category hierarchy
- `parent_id` references another category or null
- no self-parent
- no cycles
- `search_path` must be unique
- `search_path` cannot start with `/`
- `search_path` cannot end with `/`
- `search_path` cannot contain `//`

4. Entity model
- `relation_types[].from_entity_type` must reference an entity type
- `relation_types[].to_entity_type` must reference an entity type

5. Status lifecycle
- `active` and `deprecated` items should render differently
- deprecated objects should still be editable/viewable

6. Multi-category rules
- `union`, `intersection`, `priority` should be explained in the Rules screen

==================================================
6. Product Shape
==================================================

Generate a practical admin console with these screens:

1. Bundle picker screen
- load bundles using `listBundles()`
- show loading, empty, and error states
- select a bundle and open the editor

2. Main editor shell
- top bar with selected bundle, dirty state, validate, save
- left sidebar navigation
- center editor workspace
- right inspector panel for references, warnings, live summary

3. Overview screen
- bundle meta summary
- counts for vocabularies, terms, attributes, categories, entity types, relation types
- validation summary
- deprecated counts
- broken reference counts

4. Vocabularies screen
- vocabulary list
- term editor
- alias chip editor
- usage inspector

5. Attributes screen
- attribute table
- attribute detail form
- type/cardinality/status editor
- vocab_ref selector
- “used by categories” inspector

6. Categories screen
- tree navigation
- category detail form
- parent selector
- search_path editor
- alias editor
- inherit_attributes toggle
- binding editor
- binding row should dynamically show allowed_terms selector when applicable
- inspector should show inherited attributes and local overrides

7. Entity model screen
- entity types editor
- relation types editor
- from/to selectors
- simple relation graph summary is a plus

8. Normalization screen
- editable toggles/selectors
- drag/reorder or ordered list editor for alias resolution order

9. Rules screen
- editable rule controls
- explanation cards for merge strategy

10. Raw JSON / Validation screen
- readonly pretty JSON preview
- optional editable raw mode
- validation issue list with grouping

==================================================
7. Validation Requirements
==================================================

Implement validation utilities that produce:

```ts
type ValidationLevel = "ERROR" | "WARNING" | "INFO";

interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  path?: string;
}
```

Reflect these rules:
- schema_version must be SemVer like `2.0.0`
- statuses must be `active | deprecated`
- unique category ids
- unique category search_path
- unique attribute keys
- unique vocabulary ids
- category parent must exist if not null
- category cannot parent itself
- no category cycles
- enum attribute requires vocab_ref
- non-enum attribute must not define vocab_ref
- vocabulary term values unique inside each vocabulary
- alias must not collide with canonical term in same vocabulary
- alias must not map ambiguously to multiple terms in same vocabulary
- category binding key must reference an existing attribute
- deprecated bound attribute should raise warning
- allowed_terms only valid for enum attributes with vocabulary
- allowed_terms must be subset of referenced vocabulary terms
- relation from/to types must exist

Use validation both:
- globally
- inline at editor field level where possible

==================================================
8. Sample Bundle Data
==================================================

Use this sample bundle for examples, mock data, preview UI, and code samples:

```json
{
  "schema_version": "2.0.0",
  "meta": {
    "name": "image-metadata-taxonomy",
    "updated_at": "2026-04-24T00:00:00Z"
  },
  "normalization": {
    "case_insensitive": true,
    "trim_whitespace": true,
    "unicode_normalization": "NFC",
    "alias_resolution_order": [
      "attribute_alias",
      "category_alias",
      "vocabulary_term_alias"
    ],
    "deprecated_policy": {
      "accept_input": true,
      "store_as_canonical_if_possible": true,
      "warn_on_use": true
    }
  },
  "rules": {
    "id_unique": true,
    "attribute_key_unique": true,
    "search_path_unique": true,
    "child_override_parent": true,
    "status_values": ["active", "deprecated"],
    "multi_category": {
      "enabled": true,
      "max_categories_per_photo": 3,
      "attribute_merge_strategy": "intersection"
    }
  },
  "vocabularies": [
    {
      "id": "vocab_top_type",
      "status": "active",
      "terms": [
        { "value": "tshirt", "status": "active", "aliases": ["tee", "t-shirt", "티셔츠"] },
        { "value": "shirt", "status": "active", "aliases": ["셔츠"] },
        { "value": "knit", "status": "active", "aliases": ["니트", "sweater"] }
      ]
    },
    {
      "id": "vocab_style",
      "status": "active",
      "terms": [
        { "value": "minimal", "status": "active", "aliases": ["미니멀"] },
        { "value": "street", "status": "active", "aliases": ["스트릿"] },
        { "value": "casual", "status": "active", "aliases": ["캐주얼"] }
      ]
    },
    {
      "id": "vocab_garment_type",
      "status": "active",
      "terms": [
        { "value": "shirt", "status": "active", "aliases": ["셔츠"] },
        { "value": "slip_dress", "status": "active", "aliases": ["슬립드레스", "dress"] }
      ]
    }
  ],
  "attributes": [
    {
      "key": "model",
      "label": "Model",
      "type": "string",
      "cardinality": "single",
      "status": "active",
      "aliases": ["model_name", "person"]
    },
    {
      "key": "top_type",
      "label": "Top Type",
      "type": "enum",
      "cardinality": "single",
      "status": "active",
      "vocab_ref": "vocab_top_type",
      "aliases": ["upper_type", "상의종류"]
    },
    {
      "key": "style",
      "label": "Style",
      "type": "enum",
      "cardinality": "multi",
      "status": "active",
      "vocab_ref": "vocab_style",
      "aliases": ["mood_style", "스타일"]
    },
    {
      "key": "legacy_color",
      "label": "Legacy Color",
      "type": "string",
      "cardinality": "single",
      "status": "deprecated",
      "aliases": ["color_old"]
    },
    {
      "key": "garment_type",
      "label": "Garment Type",
      "type": "enum",
      "cardinality": "single",
      "status": "active",
      "vocab_ref": "vocab_garment_type",
      "aliases": ["의류종류"]
    }
  ],
  "categories": [
    {
      "id": "fashion",
      "name": "Fashion",
      "parent_id": null,
      "search_path": "fashion",
      "status": "active",
      "aliases": ["패션"],
      "inherit_attributes": false,
      "attribute_bindings": [
        { "key": "model", "required": false, "status": "active" },
        { "key": "style", "required": false, "status": "active" }
      ]
    },
    {
      "id": "tops",
      "name": "Tops",
      "parent_id": "fashion",
      "search_path": "fashion/tops",
      "status": "active",
      "aliases": ["상의"],
      "inherit_attributes": true,
      "attribute_bindings": [
        { "key": "top_type", "required": true, "status": "active" }
      ]
    },
    {
      "id": "shirt",
      "name": "Shirt",
      "parent_id": "tops",
      "search_path": "fashion/tops/shirt",
      "status": "active",
      "aliases": ["셔츠"],
      "inherit_attributes": true,
      "attribute_bindings": [
        {
          "key": "top_type",
          "required": true,
          "status": "active",
          "override": {
            "allowed_terms": ["shirt"]
          }
        },
        {
          "key": "legacy_color",
          "required": false,
          "status": "active"
        },
        {
          "key": "garment_type",
          "required": false,
          "status": "active",
          "override": {
            "allowed_terms": ["shirt"]
          }
        }
      ]
    },
    {
      "id": "dress",
      "name": "Dress",
      "parent_id": "fashion",
      "search_path": "fashion/dress",
      "status": "active",
      "aliases": ["드레스"],
      "inherit_attributes": true,
      "attribute_bindings": [
        {
          "key": "garment_type",
          "required": true,
          "status": "active",
          "override": {
            "allowed_terms": ["slip_dress"]
          }
        },
        {
          "key": "style",
          "required": false,
          "status": "active"
        }
      ]
    }
  ],
  "entity_model": {
    "entity_types": [
      {
        "id": "model",
        "label": "Model Entity",
        "status": "active",
        "aliases": ["person"]
      },
      {
        "id": "dress",
        "label": "Dress Entity",
        "status": "active"
      }
    ],
    "relation_types": [
      {
        "id": "wears",
        "label": "Wears",
        "status": "active",
        "from_entity_type": "model",
        "to_entity_type": "dress"
      }
    ]
  }
}
```

==================================================
9. Output Requirements
==================================================

Produce the answer in this order:

1. Short implementation strategy
2. Recommended file/folder structure
3. Core TypeScript types and API wrapper code
4. Zustand store design
5. Validation utility design
6. Screen and component architecture
7. Key React component code
8. Editor interaction flow
9. Save/load flow
10. Future extension notes

==================================================
10. Code Generation Constraints
==================================================

Important:
- Generate real code, not pseudo-code
- Use TypeScript everywhere
- Prefer multiple focused files over one giant file
- Show component props and state shapes
- Include enough code that a developer can directly scaffold the app
- Include practical placeholder styling only when necessary
- Use sample data where useful for mock mode
- Keep code modular and internally consistent

When there are tradeoffs, choose implementation practicality over theoretical completeness.
```

## Recommended Suffix

프롬프트 끝에 아래 한 줄을 덧붙이면 코드 산출물이 더 직접적으로 나온다.

```text
Start by generating the folder structure and the first-pass implementation for the bundle picker, app shell, taxonomy store, validation utilities, and categories editor.
```
