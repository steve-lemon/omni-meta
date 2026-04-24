# NoSQL Metadata Migration Playbook

This guide defines how to evolve photo metadata safely while preserving search/index integrity.

## Versioning rules

- Every photo document stores `taxonomy_version`.
- Writers always use the currently active `fashion.json` bundle version.
- Readers should tolerate one previous minor version during rollout.

## Document contract

```json
{
  "photo_id": "ph_006",
  "taxonomy_version": "2.0.0",
  "category_ids": ["fashion"],
  "metadata": { "model": "haeun", "style": ["minimal", "casual"] },
  "entities": [],
  "relations": []
}
```

## Migration workflow

1. Build next bundle (`npm run build:bundle`).
2. Validate next bundle (`npm run validate:fashion`).
3. Generate OpenSearch template + reindex plan (`npm run os:plan`).
4. Deploy dual-read logic if breaking changes exist.
5. Backfill NoSQL docs to new `taxonomy_version`.
6. Reindex OpenSearch and switch read alias.
7. Remove old-version fallback after validation window.

## Breaking-change checklist

Treat as breaking if any of the following occur:

- Attribute type change (`string` -> `number`, etc.)
- Enum vocabulary canonical term removal
- Category path/id removal or repurpose
- Entity relation type semantic change

For breaking changes:

- never in-place mutate existing docs;
- write transformed copy with new version;
- preserve rollback path via alias/version.

## Operational safeguards

- Idempotent migration jobs (safe to rerun).
- Dead-letter queue for failed document transforms.
- Drift monitor: sample documents whose field type mismatches OpenSearch mapping.
- Cutover only after query parity checks pass on old/new indexes.
