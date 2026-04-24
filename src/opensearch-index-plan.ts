import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile, Attribute } from "./types.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function scalarType(attr: Attribute): Record<string, unknown> {
  if (attr.type === "number") return { type: "double" };
  if (attr.type === "boolean") return { type: "boolean" };
  if (attr.type === "date") return { type: "date" };
  return { type: "keyword", ignore_above: 512 };
}

function mappingForTaxonomy(taxonomy: TaxonomyFile): Record<string, unknown> {
  const metadataProps: Record<string, unknown> = {};
  for (const attr of taxonomy.attributes) {
    if (attr.status !== "active") continue;
    metadataProps[attr.key] = {
      ...scalarType(attr),
      meta: { cardinality: attr.cardinality }
    };
  }

  return {
    dynamic: "strict",
    properties: {
      photo_id: { type: "keyword" },
      category_ids: { type: "keyword" },
      taxonomy_version: { type: "keyword" },
      metadata: { properties: metadataProps },
      entities: {
        type: "nested",
        properties: {
          id: { type: "keyword" },
          type: { type: "keyword" },
          category_ids: { type: "keyword" },
          attributes: { type: "object", dynamic: true }
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
  };
}

function dateVersion() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function main() {
  const taxonomyPath = process.argv[2] ?? "examples/fashion.json";
  const alias = process.argv[3] ?? "fashion-photo";
  const version = process.argv[4] ?? dateVersion();
  const outDir = resolve(process.cwd(), "examples/opensearch");

  const taxonomy = readJson<TaxonomyFile>(taxonomyPath);
  const indexName = `${alias}-${version}`;
  const mapping = mappingForTaxonomy(taxonomy);

  const template = {
    index_patterns: [`${alias}-*`],
    priority: 100,
    template: {
      settings: {
        index: {
          number_of_shards: 1,
          number_of_replicas: 1,
          refresh_interval: "1s"
        }
      },
      mappings: mapping
    }
  };

  const reindexPlan = {
    alias,
    index_name: indexName,
    taxonomy_version: taxonomy.schema_version,
    steps: [
      `PUT _index_template/${alias}-template`,
      `PUT ${indexName}`,
      `POST _aliases add write alias '${alias}-write' -> ${indexName}`,
      `POST _reindex source=${alias}-read dest=${indexName}`,
      `POST _aliases switch read alias '${alias}-read' -> ${indexName}`
    ]
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${alias}-template.json`), `${JSON.stringify(template, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outDir, `${alias}-reindex-plan.json`), `${JSON.stringify(reindexPlan, null, 2)}\n`, "utf8");

  console.log(`Generated: ${resolve(outDir, `${alias}-template.json`)}`);
  console.log(`Generated: ${resolve(outDir, `${alias}-reindex-plan.json`)}`);
}

main();
