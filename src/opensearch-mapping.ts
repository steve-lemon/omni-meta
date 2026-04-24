import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile, Attribute } from "./types.ts";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function scalarType(attr: Attribute): Record<string, unknown> {
  if (attr.type === "number") return { type: "double" };
  if (attr.type === "boolean") return { type: "boolean" };
  // enum/string are keyword-first for exact filtering/aggregation in OpenSearch.
  return { type: "keyword", ignore_above: 512 };
}

function fieldType(attr: Attribute): Record<string, unknown> {
  const base = scalarType(attr);
  if (attr.cardinality === "multi") {
    // OpenSearch arrays use the same scalar field type; keep explicit metadata for downstream tooling.
    return { ...base, meta: { cardinality: "multi" } };
  }
  return { ...base, meta: { cardinality: "single" } };
}

function buildMapping(taxonomy: TaxonomyFile): Record<string, unknown> {
  const metadataProps: Record<string, unknown> = {};
  for (const attr of taxonomy.attributes) {
    if (attr.status !== "active") continue;
    metadataProps[attr.key] = fieldType(attr);
  }

  return {
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 1
      }
    },
    mappings: {
      dynamic: "strict",
      properties: {
        photo_id: { type: "keyword" },
        category_ids: { type: "keyword" },
        metadata: {
          properties: metadataProps
        },
        entities: {
          type: "nested",
          properties: {
            id: { type: "keyword" },
            type: { type: "keyword" },
            category_ids: { type: "keyword" },
            attributes: {
              type: "object",
              dynamic: true
            }
          }
        },
        relations: {
          type: "nested",
          properties: {
            type: { type: "keyword" },
            from_entity_id: { type: "keyword" },
            to_entity_id: { type: "keyword" }
          }
        }
      }
    }
  };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node --experimental-strip-types src/opensearch-mapping.ts <taxonomy.json>");
    process.exit(1);
  }

  const taxonomy = loadJson<TaxonomyFile>(input);
  const mapping = buildMapping(taxonomy);
  console.log(JSON.stringify(mapping, null, 2));
}

main();
