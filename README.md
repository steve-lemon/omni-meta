# omni-meta

TypeScript-based taxonomy validator for an image metadata microservice concept.

This repository provides:
- A **single-file JSON taxonomy model** (`schema_version`, categories, attributes, vocabularies).
- A **validation engine** for structural integrity and governance rules.
- **Runnable examples** (valid/invalid) to verify behavior quickly.

## Concept highlights

- Category tree with `id` + `parent_id` for internal references.
- Search-oriented path field `search_path` (separated from internal id linkage).
- Attribute dictionary with `cardinality` (`single` | `multi`) and lifecycle `status`.
- Shared vocabularies for enum attributes, including alias normalization.
- Status lifecycle support (`active` | `deprecated`) across categories/attributes/terms.

## Project structure

- `src/types.ts`: Type definitions for taxonomy document and validation issues.
- `src/validator.ts`: Validation rules implementation.
- `src/cli.ts`: CLI entry for validating a JSON file.
- `examples/valid-taxonomy.json`: Valid sample with one warning (deprecated attribute usage).
- `examples/invalid-taxonomy.json`: Intentionally broken sample that triggers multiple errors.

## Run validation (no install required)

Validate valid sample:

```bash
npm run validate:valid
```

Validate invalid sample:

```bash
npm run validate:invalid
```

> This project uses Node's `--experimental-strip-types` to execute `.ts` files directly.

## Implemented validation rules

### Global
- `schema_version` must be SemVer (`x.y.z`).
- Status must be `active | deprecated`.
- Uniqueness checks for category ids, category search paths, attribute keys, vocabulary ids.

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
