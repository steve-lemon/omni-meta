# Entity Model Usage Guidelines

This document defines when to use `entity_model`, what `EntityTypeDefinition` is for, and how to keep entity-based schemas practical.

## 1) Why `entity_model` exists

`entity_model` is for cases where a single photo contains multiple independently meaningful objects and we need to:

- store attributes per object, not only per photo
- distinguish object roles/types inside the same photo
- query relationships between objects

Typical examples:

- `model` wears `dress`
- `person` sits_on `chair`
- `product` placed_on `table`
- `building` located_in `street`

Without `entity_model`, all metadata is flattened into photo-level `metadata`, which is not enough for object-specific filtering.

## 2) What `EntityTypeDefinition` means

`EntityTypeDefinition` defines the runtime node type of an entity.

It should answer:

- "What kind of thing is this node?"
- "What role does this object play in query logic?"

Examples:

- `model`
- `dress`
- `footwear`
- `prop`
- `place`

It should **not** answer:

- which category path the object belongs to
- fine-grained visual classification
- one-off annotation tags

Those belong to category taxonomy and attribute values, not to entity type IDs.

## 3) Use `entity_model` only when all of these are true

Use `entity_model` when:

1. A photo can contain multiple distinct objects that need separate interpretation.
2. At least one object needs its own category assignment or attributes.
3. Querying object-to-object relation matters.

Good fit:

- "Find photos where a `model` wears a `dress` and the `dress` category is `fashion/dress`."
- "Find photos where a `person` and a `dog` both exist."
- "Find photos where a `product` is on a `table`."

Bad fit:

- "The photo mood is minimal."
- "The photo was captured at night."
- "The dominant color is blue."

Those are photo-level metadata and should stay in `metadata`.

## 4) When not to use `EntityTypeDefinition`

Do not create entity types for:

- attribute values such as `minimal`, `blue`, `night`
- category leaves such as `fashion/tops/shirt`
- fields that appear only once at photo level such as `source_url`, `photographer_email`
- temporary UI concepts

If the thing can be modeled as:

- a category choice
- a scalar attribute
- an enum/color vocabulary term

prefer that over adding a new entity type.

## 5) Decision checklist

Ask these questions in order:

1. Is this information about the whole photo?
   If yes, use photo `metadata`.
2. Is this information about one object inside the photo?
   If yes, consider `entities[]`.
3. Do we need to distinguish multiple objects of the same photo independently?
   If yes, use `entity_model`.
4. Do we need to ask who is related to whom?
   If yes, define `relation_types`.

## 6) Recommended modeling roles

Use these layers consistently:

- `EntityTypeDefinition`
  Defines object kind or role in the graph.
- `category_ids`
  Defines detailed taxonomy placement for each entity instance.
- `attributes`
  Defines typed properties of that entity instance.

Example:

- entity type: `dress`
- entity category: `fashion/dress`
- entity attributes:
  - `garment_type = slip_dress`
  - `dominant_color = ivory`

This separation keeps entity types stable while categories and attributes remain expressive.

## 7) Practical design rules for `EntityTypeDefinition`

`EntityTypeDefinition.id` should be:

- stable over time
- low-cardinality
- reusable across many photos
- meaningful in query and relation logic

Recommended:

- `model`
- `dress`
- `footwear`
- `prop`
- `place`

Avoid:

- `blue_dress`
- `winter_mountain_background`
- `minimal_style_subject`

Those are combinations of category and attributes, not entity types.

## 8) Practical design rules for `RelationTypeDefinition`

Create relation types only when the edge itself matters for retrieval or reasoning.

Good examples:

- `wears`
- `holds`
- `sits_on`
- `located_at`

Avoid relations that are:

- derivable from plain containment
- only UI conveniences
- too vague to be searchable

Bad examples:

- `related_to`
- `connected`
- `has_context`

## 9) How runtime data should use entity types

Runtime entity records should look like:

```json
{
  "id": "ent_001",
  "type": "dress",
  "category_ids": ["fashion/dress"],
  "attributes": {
    "garment_type": "slip_dress",
    "dominant_color": "ivory"
  }
}
```

Key point:

- `type` is not a replacement for `category_ids`
- `category_ids` is not a replacement for `type`

Use both when both object identity and taxonomy placement matter.

## 10) Query guidance

Use `entity_filters` when:

- filtering by object presence
- filtering by object-specific attributes
- filtering by object categories

Use `relation_filters` when:

- object A must be related to object B in a specific way

Example:

```json
{
  "filters": { "style": ["minimal"] },
  "entity_filters": [
    { "type": "dress", "categories": ["fashion/dress"], "attributes": { "garment_type": "slip_dress" } }
  ],
  "relation_filters": [
    { "type": "wears", "from_type": "model", "to_type": "dress" }
  ]
}
```

## 11) Governance guidance

Add a new entity type only if:

- the object kind appears repeatedly
- it has object-specific attributes or relations
- it needs to participate in search logic

Otherwise, do not expand `entity_model`.

Preferred change order:

1. Try photo-level metadata first.
2. If object-local meaning is required, add entity usage.
3. Only then add a new `EntityTypeDefinition`.

## 12) Recommended team rule

Treat `entity_model` as an advanced capability, not the default.

Default to:

- categories
- attributes
- vocabularies

Promote to `entity_model` only when object-level separation and relations are clearly needed.

## 13) Design Reference Example: `sample/model-in-chair.png`

This image is a good example of when `entity_model` becomes justified for design-reference retrieval.

Why:

- a `model` is the main subject
- the `dress` is a distinct wearable object
- the `bag` is a separate prop-like object
- the `chair` matters for pose and composition
- the `cafe` storefront acts as a place/background anchor

If the product goal is only:

- classify the image as a background
- tag mood, weather, color, composition

then photo-level metadata is enough.

If the product goal is:

- search for "model sitting on chair in front of cafe"
- search for "dress + bag + chair composition"
- support layout/styling reference retrieval

then `entity_model` is appropriate.

Recommended entity types for this sample:

- `model`
- `dress`
- `bag`
- `chair`
- `place`

Recommended relation types for this sample:

- `wears`
- `sits_on`
- `placed_on`
- `located_at`

Recommended runtime interpretation:

- `model`
  Main human subject.
- `dress`
  Wearable garment on the model.
- `bag`
  Separate object placed on the adjacent chair.
- `chair`
  Physical support/pose anchor.
- `place`
  Cafe/storefront context behind the subject.

Recommended sample entity graph:

```json
{
  "entities": [
    {
      "id": "ent_model_01",
      "type": "model",
      "category_ids": ["person"],
      "attributes": {
        "pose_type": "seated"
      }
    },
    {
      "id": "ent_dress_01",
      "type": "dress",
      "category_ids": ["fashion/dress"],
      "attributes": {
        "dominant_color": "ivory"
      }
    },
    {
      "id": "ent_bag_01",
      "type": "bag",
      "category_ids": ["prop/bag"],
      "attributes": {
        "dominant_color": "black"
      }
    },
    {
      "id": "ent_chair_01",
      "type": "chair",
      "category_ids": ["prop/chair"],
      "attributes": {}
    },
    {
      "id": "ent_place_01",
      "type": "place",
      "category_ids": ["place/cafe"],
      "attributes": {}
    }
  ],
  "relations": [
    { "type": "wears", "from_entity_id": "ent_model_01", "to_entity_id": "ent_dress_01" },
    { "type": "sits_on", "from_entity_id": "ent_model_01", "to_entity_id": "ent_chair_01" },
    { "type": "placed_on", "from_entity_id": "ent_bag_01", "to_entity_id": "ent_chair_01" },
    { "type": "located_at", "from_entity_id": "ent_model_01", "to_entity_id": "ent_place_01" }
  ]
}
```

Photo-level metadata that should still remain outside the entity graph:

- `dominant_colors` for the overall image palette
- `orientation`
- `composition`
- `mood`
- `keyword_tags`

Rule of thumb from this sample:

- object with independent styling/layout meaning = entity
- overall visual impression = photo metadata
