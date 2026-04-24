# Photo-driven Taxonomy Design Review (Cafe Street Scene)

## 1) Observable metadata candidates from the attached image

The photo appears to show a person seated outdoors in front of a cafe window/menu board, with mixed sunlight/shadow and multiple scene objects (chair, backpack, plants, wall texture, signage).

### Core fashion candidates (already partly covered)

- `style`: minimal / casual
- `top_type`: likely dress-like silhouette (current schema only has tops-centric enum terms)
- color cues: muted blue-green garment, black shoes, white socks

### Scene/context candidates (currently missing)

- `location_type`: cafe_exterior / street
- `background_text_presence`: true (menu/signage text visible)
- `lighting`: natural_sunlight / hard_shadow
- `shot_composition`: seated_full_body / candid
- `props`: chair, backpack, plant

### Quality/annotation candidates (currently missing)

- `occlusion_level`: partial face occlusion (hand covering mouth)
- `text_legibility`: medium-high (large menu text readable)
- `subject_count`: single

## 2) Gaps in the current design

1. **Category coverage is tops-heavy**
   - Current taxonomy is centered on `fashion -> tops -> shirt`, so one-piece outfit cases (dress/jumpsuit) are hard to represent naturally.

2. **Style/search dimensions are under-modeled**
   - Important retrieval pivots visible in this image (lighting, pose, scene type, props) are absent.

3. **Color modeling is legacy-only**
   - Existing `legacy_color` is deprecated, but no replacement color schema is provided.

4. **No composition/quality axes**
   - Real-world filtering often needs shot type, occlusion, and text/background complexity signals.

5. **Multi-category strategy semantics are defined, but examples are narrow**
   - Existing simulation scenarios validate alias and intersection behavior, but do not stress richer real-photo metadata.

## 3) Recommended improvements

## A. Taxonomy extension (priority)

- Add categories for one-piece garments (e.g., `fashion/onepiece/dress`) and footwear/accessory dimensions.
- Add enum attributes:
  - `scene_type` (`cafe_exterior`, `street`, `studio`, ...)
  - `lighting_type` (`natural`, `indoor_warm`, `backlit`, ...)
  - `pose_type` (`seated`, `standing`, `walking`, ...)
  - `shot_framing` (`full_body`, `half_body`, `closeup`, ...)
- Replace deprecated `legacy_color` with canonical color attributes:
  - `primary_color` (single enum)
  - `accent_colors` (multi enum)

## B. Normalization/alias policy

- Add Korean/English alias sets for new scene and pose terms.
- Keep canonical storage in one language while allowing multilingual query aliases.

## C. Validation rules

- If `shot_framing=full_body`, require at least one lower-body or footwear-related attribute group where applicable.
- If `scene_type` is present, ensure value belongs to defined scene vocabulary.
- Add warning when only deprecated color attributes are present without canonical replacement.

## D. Simulation coverage

- Introduce a new scenario that queries by scene+fashion jointly, e.g.:
  - `categories: ["fashion/onepiece/dress"]`
  - `filters: { scene_type: "cafe_exterior", lighting_type: "natural", style: ["minimal"] }`
- Include a case where partial occlusion still matches fashion attributes but fails a strict face-visibility filter.

## 4) Suggested implementation order

1. Extend taxonomy schema + vocabularies (`types.ts`, `valid-taxonomy.json`).
2. Add validator rules for new required/consistency checks (`validator.ts`).
3. Expand sample photo dataset and simulation scenarios (`fashion-photos.json`, `simulation.ts`).
4. Keep README in sync with new query examples and exit-code expectations.

## 5) Flexible entity-relation model (for multi-entity photos)

To improve extensibility, each photo should support a graph payload:

- `entities[]`: node list (e.g., `model`, `dress`, `footwear`, `prop`, `place`)
- `relations[]`: typed edges between nodes (e.g., `wears`, `sits_on`, `located_at`)
- each entity includes `category_ids` (max 3), and entity `attributes` must be valid under those category bindings.

This allows one photo to contain many entities and explicit semantics between them.

### Minimal example shape

```json
{
  "id": "ph_006",
  "entities": [
    { "id": "e_model_006", "type": "model", "category_ids": ["person"], "attributes": { "model": "haeun" } },
    { "id": "e_dress_006", "type": "dress", "category_ids": ["dress"], "attributes": { "garment_type": "slip_dress" } }
  ],
  "relations": [
    { "type": "wears", "from_entity_id": "e_model_006", "to_entity_id": "e_dress_006" }
  ]
}
```

### Why this is better than flat metadata-only

1. **Many-entity support**: multiple garments/props/people per image without key collisions.
2. **Compositional queries**: e.g., “model wears dress AND model sits_on chair”.
3. **Future-proofing**: add entity types (bag, accessory, logo, text-block) without breaking existing keys.
