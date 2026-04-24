# Background Taxonomy Entity Review

This note applies the `entity_model` guidelines to `sample/background.json`.

## Conclusion

`sample/background.json` should **not** use `entity_model` by default.

The current bundle is primarily about:

- background scene classification
- photo-level atmosphere and environment
- photo-level visual properties

Those are better represented as:

- `categories`
- photo `metadata`
- vocabulary-backed attributes

Not as object graph entities.

Exception:

If the same asset set is also used for design-reference retrieval, `entity_model` can be added as an optional advanced layer.

## Why `entity_model` is not the default here

The current attributes in `sample/background.json` are:

- `dominant_colors`
- `time_of_day`
- `weather`
- `season`
- `orientation`
- `composition`
- `has_people`
- `has_manmade_object`
- `keyword_tags`
- `mood`

These describe the whole image or the dominant background condition, not independently queryable objects.

The current categories are also scene-level:

- `nature`
- `city`
- `indoor`
- `abstract`
- `nature_sky_clear`
- `city_nightscape`

They classify the image as a background scene, not as a graph of multiple objects.

## Recommended modeling rule for this sample

For `sample/background.json`:

- keep all current fields at photo level
- do not add `entity_model` for people, clouds, buildings, trees, or props unless they need object-level retrieval
- treat `has_people` and `has_manmade_object` as summary flags, not entity definitions

This is the simplest and most maintainable model for a background-image taxonomy.

## Good fit for photo-level metadata in this sample

Stay in photo `metadata` for:

- weather
- time of day
- season
- dominant colors
- overall mood
- composition technique
- presence flags such as `has_people`

These values describe the scene as a whole and do not require entity separation.

## When `entity_model` would become justified

Add `entity_model` only if the background catalog evolves to support object-level search such as:

- "Find backgrounds with a `bridge` over a `river`."
- "Find images where a `person` sits on a `bench`."
- "Find photos where a `car` is parked in front of a `building`."
- "Find backgrounds with both `tree` and `lake` as separate objects."

In those cases, object presence alone is not enough; the system must keep per-object categories, attributes, or relations.

## Applied example: `sample/model-in-chair.png`

`sample/model-in-chair.png` is a concrete case where a hybrid approach is better than pure scene-only tagging.

Photo-level interpretation:

- category can still stay scene-oriented, such as `indoor_cafe` or `city`-adjacent storefront context
- image-level metadata such as `dominant_colors`, `mood`, `composition`, `orientation` still belongs in photo metadata

Entity-level interpretation for design-reference usage:

- `model`
- `dress`
- `bag`
- `chair`
- `place` with cafe meaning

Recommended relations:

- `wears`: model -> dress
- `sits_on`: model -> chair
- `placed_on`: bag -> chair
- `located_at`: model -> place

Why these entities are worth separating:

- `model`
  Main pose anchor.
- `dress`
  Styling anchor.
- `bag`
  Secondary prop with composition importance.
- `chair`
  Layout/pose anchor that influences framing.
- `place`
  Background concept anchor for "cafe-like" search.

Why some things should still stay out of `entity_model`:

- signage text such as `Coffee`
- generic mood tags
- overall lighting impression
- whole-image dominant palette

Those are better handled as photo-level metadata unless text retrieval or OCR-level search is a product requirement.

## Recommended decision for this sample family

For background-only cataloging:

1. Keep `sample/background.json` without `entity_model`.
2. Use categories and attributes only.

For design-reference / layout-reference cataloging:

1. Keep existing scene-level categories and metadata.
2. Add `entity_model` as an additional layer, not a replacement.
3. Start with a narrow entity set:
   - `model`
   - `dress`
   - `bag`
   - `chair`
   - `place`
4. Start with a narrow relation set:
   - `wears`
   - `sits_on`
   - `placed_on`
   - `located_at`

This keeps the background taxonomy simple while still enabling richer design search when needed.

## What not to do

Do not create entity types for:

- `맑은 하늘`
- `노을`
- `도시`
- `야경`
- `분위기`
- `날씨`

These are scene/category/attribute concepts, not stable entity node types.

## If future object modeling is needed

Introduce `entity_model` in a small, controlled way.

Recommended first entity types:

- `person`
- `vehicle`
- `building`
- `tree`
- `water`
- `prop`

Recommended first relation types:

- `in_front_of`
- `next_to`
- `on`
- `over`

Only add them if the product truly needs object-specific retrieval or ranking.

## Practical recommendation for the current sample

Use this decision:

1. Keep `sample/background.json` without `entity_model`.
2. Continue improving category coverage and attribute quality first.
3. If `model-in-chair.png`-style design reference retrieval becomes a product requirement, add entity modeling as an optional second layer.

## Team rule for this taxonomy

For background-photo standards:

- scene = category
- scene property = attribute
- repeated object with independent search meaning = entity

Until the third condition appears in product requirements, do not expand into `entity_model`.
