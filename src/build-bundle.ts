import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile } from "./types.ts";

type DomainIndex = {
  base: string;
  vocabularies: string;
  attributes: string;
  categories: string;
  entity_model?: string;
};

type BaseSection = Pick<TaxonomyFile, "schema_version" | "meta" | "normalization" | "rules">;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function main() {
  const indexPath = process.argv[2] ?? "examples/domains/index.json";
  const outPath = process.argv[3] ?? "examples/fashion.json";

  const index = readJson<DomainIndex>(indexPath);
  const base = readJson<BaseSection>(index.base);

  const bundle: TaxonomyFile = {
    ...base,
    vocabularies: readJson(index.vocabularies),
    attributes: readJson(index.attributes),
    categories: readJson(index.categories),
    entity_model: index.entity_model ? readJson(index.entity_model) : undefined
  };

  writeFileSync(resolve(process.cwd(), outPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`Built bundle: ${outPath}`);
}

main();
