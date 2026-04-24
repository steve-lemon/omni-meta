# Bundle Manager CLI Workflow

Command:

```bash
npm run bundle:cli
```

Validate a manually created bundle directly:

```bash
npm run bundle:cli -- --validate-only path/to/manual-bundle.json
```

Verbose logging:

```bash
npm run bundle:cli -- --verbose
```

## What it does

- Supports two paths:
  - bundle validation for manually created JSON bundles,
  - image analysis / feedback / improvement loop.
- In validation mode, prints:
  - bundle summary counts,
  - grouped blocking errors / warnings / info,
  - recommended improvement checklist,
  - final readiness status.
- In analysis mode:
  - selects a bundle file (default `examples/fashion.json`),
  - accepts an image path and free-form observation text,
  - uses OpenAI SDK vision analysis (when `OPENAI_API_KEY` is set) to enrich recommendations,
  - recommends category IDs and enum/color attribute tags by matching vocab terms/aliases,
  - collects feedback and creates a lightweight improvement plan,
  - waits for approval, then executes one of:
    - add a new alias to a vocabulary term,
    - append a runtime guideline note,
  - repeats the loop until there is no feedback.
- Emits timestamped session logs (`INFO/WARN/ERROR`, plus `DEBUG` in verbose mode) so execution traces are easy to debug later.

## Notes

- Set `OPENAI_API_KEY` to enable SDK-based image analysis.
- Optional model override: `OPENAI_VISION_MODEL` (default: `gpt-4.1-mini`).
- CLI auto-loads `.env` from project root if present.
- If API key is missing or API call fails, CLI falls back to text-only keyword matching.
- Recommended category IDs are capped to 3.
- Bundle edits are written directly to the selected bundle path.
- `--validate-only` exits with code `2` when blocking validation errors exist.
