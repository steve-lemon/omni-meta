# Bundle Manager CLI Workflow

Command:

```bash
npm run bundle:cli
```

Verbose logging:

```bash
npm run bundle:cli -- --verbose
```

## What it does

- Selects a bundle file (default `examples/fashion.json`).
- Accepts an image path and free-form observation text.
- Uses OpenAI SDK vision analysis (when `OPENAI_API_KEY` is set) to enrich recommendations.
- Recommends category IDs and enum attribute tags by matching vocab terms/aliases.
- Collects feedback and creates a lightweight improvement plan.
- Waits for approval, then executes one of:
  - add a new alias to a vocabulary term,
  - append a runtime guideline note.
- Repeats the loop until there is no feedback.
- Emits timestamped session logs (`INFO/WARN/ERROR`, plus `DEBUG` in verbose mode) so execution traces are easy to debug later.

## Notes

- Set `OPENAI_API_KEY` to enable SDK-based image analysis.
- Optional model override: `OPENAI_VISION_MODEL` (default: `gpt-4.1-mini`).
- If API key is missing or API call fails, CLI falls back to text-only keyword matching.
- Recommended category IDs are capped to 3.
- Bundle edits are written directly to the selected bundle path.
