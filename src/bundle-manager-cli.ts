import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { TaxonomyFile } from "./types.ts";

type Recommendation = {
  categories: string[];
  attributes: Array<{ key: string; value: string }>;
};

function loadBundle(path: string): TaxonomyFile {
  const full = resolve(process.cwd(), path);
  return JSON.parse(readFileSync(full, "utf8")) as TaxonomyFile;
}

function saveBundle(path: string, bundle: TaxonomyFile) {
  const full = resolve(process.cwd(), path);
  writeFileSync(full, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}

function normalize(v: string) {
  return v.trim().toLowerCase().normalize("NFC");
}

function recommend(bundle: TaxonomyFile, observation: string, imagePath: string): Recommendation {
  const text = normalize(`${observation} ${imagePath}`);
  const categories = bundle.categories
    .filter((c) => {
      if (text.includes(normalize(c.id))) return true;
      if (text.includes(normalize(c.name))) return true;
      if (text.includes(normalize(c.search_path))) return true;
      return (c.aliases ?? []).some((a) => text.includes(normalize(a)));
    })
    .map((c) => c.id);

  const attributes: Array<{ key: string; value: string }> = [];
  for (const attr of bundle.attributes) {
    if (attr.type !== "enum" || !attr.vocab_ref) continue;
    const vocab = bundle.vocabularies.find((v) => v.id === attr.vocab_ref);
    if (!vocab) continue;

    for (const term of vocab.terms) {
      const all = [term.value, ...(term.aliases ?? [])];
      if (all.some((candidate) => text.includes(normalize(candidate)))) {
        attributes.push({ key: attr.key, value: term.value });
        break;
      }
    }
  }

  return {
    categories: [...new Set(categories)].slice(0, 3),
    attributes
  };
}

function makePlan(feedback: string): string[] {
  const f = normalize(feedback);
  const plan: string[] = [];

  if (f.includes("alias") || f.includes("동의어")) {
    plan.push("Add or refine vocabulary aliases in the selected bundle.");
  }
  if (f.includes("카테고리") || f.includes("category")) {
    plan.push("Review category hierarchy/bindings and update classification paths.");
  }
  if (f.includes("가이드") || f.includes("지침") || f.includes("문서")) {
    plan.push("Update runtime guideline docs to reflect clarified annotation rules.");
  }
  if (plan.length === 0) {
    plan.push("Triage feedback and convert into one bundle update + one doc update candidate.");
  }
  plan.push("Re-run image analysis with updated bundle and verify feedback closure.");
  return plan;
}

function ensureRuntimeGuideBullet(note: string) {
  const path = resolve(process.cwd(), "docs/runtime-considerations.md");
  const original = readFileSync(path, "utf8");
  const marker = "## 4) OpenSearch indexing (type-safe)";
  if (!original.includes(marker)) return false;
  const updated = `${original}\n- ${note}\n`;
  writeFileSync(path, updated, "utf8");
  return true;
}

async function executeApprovedActions(
  rl: ReturnType<typeof createInterface>,
  bundlePath: string,
  bundle: TaxonomyFile
): Promise<TaxonomyFile> {
  console.log("\n승인된 계획 실행 옵션:");
  console.log("  1) vocab alias 추가");
  console.log("  2) runtime guide 문서에 지침 추가");
  console.log("  3) 이번 라운드 작업 건너뛰기");

  const mode = await rl.question("선택 (1/2/3): ");

  if (mode === "1") {
    const vocabId = await rl.question("vocab id: ");
    const termValue = await rl.question("canonical term value: ");
    const alias = await rl.question("new alias: ");

    const vocab = bundle.vocabularies.find((v) => v.id === vocabId);
    const term = vocab?.terms.find((t) => normalize(t.value) === normalize(termValue));
    if (!vocab || !term) {
      console.log("⚠️ vocab/term을 찾지 못했습니다. 수동 편집이 필요합니다.");
      return bundle;
    }

    term.aliases = term.aliases ?? [];
    if (!term.aliases.some((a) => normalize(a) === normalize(alias))) {
      term.aliases.push(alias);
      saveBundle(bundlePath, bundle);
      console.log(`✅ alias 추가 완료: ${vocabId}.${termValue} += ${alias}`);
    } else {
      console.log("ℹ️ 이미 존재하는 alias입니다.");
    }
  } else if (mode === "2") {
    const note = await rl.question("추가할 지침 한 줄: ");
    const ok = ensureRuntimeGuideBullet(note);
    if (ok) {
      console.log("✅ docs/runtime-considerations.md 에 지침을 추가했습니다.");
    } else {
      console.log("⚠️ runtime guide 수정 실패 (marker 미발견).");
    }
  } else {
    console.log("ℹ️ 이번 라운드는 작업을 건너뜁니다.");
  }

  return loadBundle(bundlePath);
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("=== Bundle Manager CLI ===");
    console.log("지원 시나리오: bundle 선택 -> 이미지 선택 -> 태그 추천 -> 피드백 -> 계획/승인 -> 작업 -> 반복");

    const bundlePathInput = await rl.question("관리할 bundle 경로 (default: examples/fashion.json): ");
    const bundlePath = bundlePathInput.trim() || "examples/fashion.json";

    if (!existsSync(resolve(process.cwd(), bundlePath))) {
      console.error(`Bundle not found: ${bundlePath}`);
      process.exit(1);
    }

    let bundle = loadBundle(bundlePath);
    console.log(`Loaded bundle: ${bundlePath} (schema ${bundle.schema_version})`);

    while (true) {
      const imagePath = await rl.question("\n분석할 이미지 경로: ");
      if (!imagePath.trim()) {
        console.log("이미지 경로가 비어 있어 종료합니다.");
        break;
      }

      if (!existsSync(resolve(process.cwd(), imagePath))) {
        console.log("⚠️ 이미지 파일이 존재하지 않습니다. 그래도 텍스트 기반 분석은 계속할 수 있습니다.");
      }

      const observation = await rl.question("관찰 내용(자유 입력, 키워드 기반 추천): ");
      const recommendation = recommend(bundle, observation, imagePath);

      console.log("\n[자동 추천]");
      console.log(`- category_ids (<=3): ${recommendation.categories.join(", ") || "(none)"}`);
      if (recommendation.attributes.length === 0) {
        console.log("- attributes: (none)");
      } else {
        for (const item of recommendation.attributes) {
          console.log(`- ${item.key}: ${item.value}`);
        }
      }

      const feedback = await rl.question("\n피드백(없으면 Enter): ");
      if (!feedback.trim()) {
        console.log("피드백 없음 -> 반복 종료.");
        break;
      }

      const plan = makePlan(feedback);
      console.log("\n[개선 작업 계획]");
      plan.forEach((p, i) => console.log(`${i + 1}. ${p}`));

      const approved = await rl.question("계획 승인 후 실행할까요? (y/N): ");
      if (normalize(approved) === "y" || normalize(approved) === "yes") {
        bundle = await executeApprovedActions(rl, bundlePath, bundle);
      } else {
        console.log("승인되지 않아 작업은 보류합니다.");
      }

      console.log("\n업데이트된 번들로 다음 분석 라운드를 진행합니다.");
    }
  } finally {
    rl.close();
  }
}

main();
