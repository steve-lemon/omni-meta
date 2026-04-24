# Bundle Manager CLI Workflow

Command:

```bash
npm run bundle:cli
```

## What it does

- Selects a bundle file (default `examples/fashion.json`).
- Accepts an image path and free-form observation text.
- Recommends category IDs and enum attribute tags by matching vocab terms/aliases.
- Collects feedback and creates a lightweight improvement plan.
- Waits for approval, then executes one of:
  - add a new alias to a vocabulary term,
  - append a runtime guideline note.
- Repeats the loop until there is no feedback.

## Notes

- Image analysis is currently keyword-assisted (observation text + file path), not full computer vision inference.
- Recommended category IDs are capped to 3.
- Bundle edits are written directly to the selected bundle path.
