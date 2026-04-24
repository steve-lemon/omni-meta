import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaxonomyFile } from "./types.ts";
import { validateTaxonomy } from "./validator.ts";

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: tsx src/cli.ts <taxonomy-json-file>");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), target);
  const raw = readFileSync(filePath, "utf-8");
  const doc = JSON.parse(raw) as TaxonomyFile;

  const issues = validateTaxonomy(doc);
  const errors = issues.filter((it) => it.level === "ERROR");

  console.log(`Validated: ${target}`);
  console.log(`- Total issues: ${issues.length}`);
  console.log(`- Errors: ${errors.length}`);
  console.log(`- Warnings/Info: ${issues.length - errors.length}`);

  for (const issue of issues) {
    const path = issue.path ? ` (${issue.path})` : "";
    console.log(`[${issue.level}] ${issue.code}${path}: ${issue.message}`);
  }

  if (errors.length > 0) {
    process.exit(2);
  }

  console.log("Validation passed with no blocking errors.");
}

main();
