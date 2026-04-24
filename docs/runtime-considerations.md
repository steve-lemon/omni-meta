# Runtime Implementation Considerations

This document reflects production-oriented constraints for metadata governance, storage, and search.

## 1) Single-bundle load via `fashion.json`

- Treat `fashion.json` as the **runtime bundle entrypoint**.
- At service startup, load this bundle once and keep it in memory as read-only reference data.
- Include a bundle checksum/version to support safe cache invalidation when standards change.

Recommended startup flow:

1. Build and publish `fashion.json` (`npm run build:bundle` in CI).
2. Validate taxonomy/model integrity (`validateTaxonomy`).
3. Build fast lookup maps (category by id, attribute by key, vocab by id).
4. Expose immutable registry to API/indexer workers.

## 2) Separate management per domain

Even if runtime loads one bundle, source-of-truth can stay domain-separated:

- `fashion-core` (global rules, normalization)
- `fashion-garment` (garment-related vocab/attributes)
- `fashion-scene` (scene/pose/prop vocab)
- `fashion-entity` (entity/relation types)

CI should merge domain files into `fashion.json` and run validation before publish.

## 3) NoSQL key storage for per-photo metadata

Store each photo as a single document keyed by `photo_id`.

Suggested document shape:

- `photo_id` (PK)
- `category_ids` (photo-level categories)
- `metadata` (typed scalar/array fields)
- `entities[]` (nested entity nodes with `category_ids` and typed attributes)
- `relations[]` (typed edges)
- `taxonomy_version` (for migration/reindex)

Key point: keep values in native types (string/number/boolean/array), not serialized blobs.

## 4) OpenSearch indexing (type-safe)

To keep search reliable:

- Use strict mappings for known top-level fields.
- Keep `metadata.<attr>` mapped by taxonomy type (`keyword`, `double`, `boolean`).
- Use `nested` for `entities` and `relations` to preserve relation-local query semantics.
- Reindex when taxonomy type changes.

This repo includes `src/opensearch-mapping.ts` to generate a baseline OpenSearch mapping from taxonomy:

```bash
npm run mapping:os
```

The generator preserves attribute datatype/cardinality intent and emits nested structures for entity-graph queries.

For rollout automation, use:

```bash
npm run os:plan
```

This emits index template and reindex plan artifacts under `examples/opensearch/`.
