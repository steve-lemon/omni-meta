# omni-meta

TypeScript-based taxonomy validator for an image metadata microservice concept.

This repository provides:
- A **single-file JSON taxonomy model** (`schema_version`, categories, attributes, vocabularies).
- A **validation engine** for structural integrity and governance rules.
- **Runnable examples** (valid/invalid) to verify behavior quickly.
- A **fashion model photo simulation** to test whether the taxonomy can express and search important metadata dimensions, including multi-category assignment.

## Concept highlights

- Category tree with `id` + `parent_id` for internal references.
- Search-oriented path field `search_path` (separated from internal id linkage).
- Attribute dictionary with `cardinality` (`single` | `multi`) and lifecycle `status`.
- Shared vocabularies for enum attributes, including alias normalization.
- Status lifecycle support (`active` | `deprecated`) across categories/attributes/terms.
- Multi-category support (max 3 categories per photo) with flexible attribute merge strategy.
- Optional entity-graph model for multi-entity photos (entities + typed relations), where each entity has up to 3 categories and category-governed attributes.

## Project structure

- `src/types.ts`: Type definitions for taxonomy document and validation issues.
- `src/validator.ts`: Validation rules implementation.
- `src/cli.ts`: CLI entry for validating a JSON file.
- `src/simulation.ts`: Simulation runner for fashion-model-photo metadata search scenarios.
- `src/opensearch-mapping.ts`: Generates OpenSearch mapping from taxonomy types.
- `examples/valid-taxonomy.json`: Valid sample with one warning (deprecated attribute usage).
- `examples/invalid-taxonomy.json`: Intentionally broken sample that triggers multiple errors.
- `examples/fashion-photos.json`: Sample photo metadata records used in simulation.
- `docs/photo-design-review.md`: Photo-driven gap analysis and taxonomy improvement proposals.
- `docs/runtime-considerations.md`: Runtime bundle/NoSQL/OpenSearch implementation guidance.

## Branch resume guide

This branch currently centers on three linked capabilities:

- **Validator + CLI baseline** for taxonomy integrity checks.
- **Fashion-photo simulation** for realistic query behavior.
- **Multi-category support** with configurable merge strategy (`union | intersection | priority`).

Use this quick flow when resuming work:
1. `npm run validate:valid` → verify non-blocking path (warnings allowed).
2. `npm run validate:invalid` → verify blocking error path (expected exit code: `2`).
3. `npm run simulate` → verify category/attribute normalization and search matching.

Suggested change boundaries:
- Taxonomy rule/schema changes: update `src/types.ts` + `src/validator.ts` together.
- Query behavior/scenario changes: update `src/simulation.ts` + `examples/fashion-photos.json` together.
- CLI/output contract changes: update `src/cli.ts` + README sections that document exit behavior.

## Run validation (no install required)

Validate valid sample:

```bash
npm run validate:valid
```

Validate invalid sample:

```bash
npm run validate:invalid
```

Run simulation:

```bash
npm run simulate
```

Generate OpenSearch mapping:

```bash
npm run mapping:os
```

> This project uses Node's `--experimental-strip-types` to execute `.ts` files directly.

## Multi-category rule design

`rules.multi_category` fields:
- `enabled`: multi-category feature on/off
- `max_categories_per_photo`: allowed range `1..3`
- `attribute_merge_strategy`: `union | intersection | priority`

### Merge strategy meaning
- `union`: any category that allows an attribute makes it available.
- `intersection`: only attributes common to all selected categories are available.
- `priority`: first category's effective attributes are authoritative.

## Simulation scenarios

`npm run simulate` runs 4 scenarios:
1. **기본 정밀 검색**: 단일 카테고리 + 모델/상의/스타일 조건.
2. **멀티 카테고리 공통 속성 검색**: 복수 카테고리 지정 시 공통 속성(intersection) 중심 검색.
3. **alias 정규화 검색**: category/attribute/value alias 입력을 canonical 값으로 정규화 후 검색.
4. **엔터티/관계 기반 검색**: 한 사진 내 복수 엔터티와 관계(예: 모델-착용-드레스) 조건으로 검색.

The simulation enforces category inheritance-aware bindings and applies the configured multi-category merge strategy.

## Implemented validation rules

### Global
- `schema_version` must be SemVer (`x.y.z`).
- Status must be `active | deprecated`.
- Uniqueness checks for category ids, category search paths, attribute keys, vocabulary ids.
- `rules.multi_category.max_categories_per_photo` must be integer in range `1..3`.
- `rules.multi_category.attribute_merge_strategy` must be one of `union | intersection | priority`.

### Category tree
- `parent_id` must reference an existing category (or be `null`).
- Self-parent is forbidden.
- Cycle detection is enforced.
- Warning when a child category is `active` while its parent is `deprecated`.
- `search_path` cannot start/end with `/` and cannot include `//`.

### Attributes
- Enum attributes must define `vocab_ref` and that vocabulary must exist.
- Non-enum attributes must not define `vocab_ref`.

### Vocabularies
- Term values must be unique inside the same vocabulary.
- Alias must not collide with canonical term names.
- Alias cannot map to multiple canonical terms.

### Category attribute bindings
- Binding key must reference an existing attribute.
- Warning when binding references deprecated attributes.
- `override.allowed_terms` is only valid for enum attributes with vocabularies.
- `override.allowed_terms` must be a subset of the referenced vocabulary terms.

## Exit code contract

- `0`: no blocking errors.
- `2`: validation completed with one or more errors.
- `1`: CLI usage failure (missing file arg).
