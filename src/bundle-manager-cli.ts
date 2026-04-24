import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { TaxonomyFile, ValidationIssue, ValidationLevel } from "./types.ts";
import { validateTaxonomy } from "./validator.ts";

type Recommendation = {
  categories: string[];
  attributes: Array<{ key: string; value: string }>;
  aiAnalysis?: string;
};

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const SESSION_ID = `session-${Date.now()}`;
const VERBOSE = process.argv.includes("--verbose");
const VALIDATE_ONLY = process.argv.includes("--validate-only");

type ValidationSummary = {
  total: number;
  errors: number;
  warnings: number;
  info: number;
};

function loadEnvFile(path = ".env"): number {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return 0;

  const raw = readFileSync(full, "utf8");
  let loaded = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (level === "DEBUG" && !VERBOSE) return;
  const timestamp = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : "";
  console.log(`[${timestamp}] [${SESSION_ID}] [${level}] ${message}${ctx}`);
}

function loadBundle(path: string): TaxonomyFile {
  const full = resolve(process.cwd(), path);
  log("DEBUG", "Loading bundle file", { path: full });
  const parsed = JSON.parse(readFileSync(full, "utf8")) as TaxonomyFile;
  log("INFO", "Bundle loaded", {
    schema_version: parsed.schema_version,
    categories: parsed.categories.length,
    attributes: parsed.attributes.length,
    vocabularies: parsed.vocabularies.length
  });
  return parsed;
}

function saveBundle(path: string, bundle: TaxonomyFile) {
  const full = resolve(process.cwd(), path);
  log("DEBUG", "Saving bundle file", { path: full });
  writeFileSync(full, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  log("INFO", "Bundle saved", { path: full, schema_version: bundle.schema_version });
}

function summarizeIssues(issues: ValidationIssue[]): ValidationSummary {
  return {
    total: issues.length,
    errors: issues.filter((issue) => issue.level === "ERROR").length,
    warnings: issues.filter((issue) => issue.level === "WARNING").length,
    info: issues.filter((issue) => issue.level === "INFO").length
  };
}

function groupIssuesByLevel(issues: ValidationIssue[]): Record<ValidationLevel, ValidationIssue[]> {
  return {
    ERROR: issues.filter((issue) => issue.level === "ERROR"),
    WARNING: issues.filter((issue) => issue.level === "WARNING"),
    INFO: issues.filter((issue) => issue.level === "INFO")
  };
}

function collectImprovementSuggestions(issues: ValidationIssue[]): string[] {
  const suggestions = new Set<string>();
  for (const issue of issues) {
    if (issue.code.startsWith("R_SCHEMA")) suggestions.add("`schema_version`을 `x.y.z` 형식으로 맞추세요.");
    if (issue.code.startsWith("R_STATUS")) suggestions.add("모든 `status` 값을 `active | deprecated` 중 하나로 정리하세요.");
    if (issue.code.includes("DUPLICATE")) suggestions.add("중복 ID/키/별칭을 제거하고 canonical 값을 하나로 정리하세요.");
    if (issue.code.startsWith("C_PARENT") || issue.code.startsWith("C_SELF_PARENT") || issue.code.startsWith("C_CYCLE")) {
      suggestions.add("카테고리 트리의 `parent_id` 연결을 다시 점검해 순환과 잘못된 참조를 없애세요.");
    }
    if (issue.code.startsWith("C_PATH")) suggestions.add("`search_path`는 선행/후행 `/` 없이, 중복 슬래시 없이 고유하게 유지하세요.");
    if (issue.code.startsWith("A_VOCAB") || issue.code.startsWith("A_ENUM") || issue.code.startsWith("A_COLOR")) {
      suggestions.add("속성 타입과 `vocab_ref` 관계를 다시 맞추고, color 속성은 color vocabulary만 참조하게 하세요.");
    }
    if (issue.code.startsWith("A_NON_ENUM")) suggestions.add("`enum`/`color`가 아닌 속성에서는 `vocab_ref`를 제거하세요.");
    if (issue.code.startsWith("A_PRIORITY")) suggestions.add("`priority`는 0 이상의 정수만 사용하세요.");
    if (issue.code.startsWith("V_COLOR_CODE")) suggestions.add("color vocabulary term에는 유효한 hex `color_code`를 넣고, 일반 vocabulary에는 넣지 마세요.");
    if (issue.code.startsWith("V_ALIAS")) suggestions.add("같은 vocabulary 안에서 alias가 canonical term이나 다른 term과 충돌하지 않도록 정리하세요.");
    if (issue.code.startsWith("B_ATTR_NOT_FOUND")) suggestions.add("카테고리 바인딩의 `key`가 실제 attribute 정의를 가리키는지 확인하세요.");
    if (issue.code.startsWith("B_OVERRIDE")) suggestions.add("`override.allowed_terms`는 enum/color + vocab_ref 조합에서만 쓰고 vocab term subset으로 맞추세요.");
    if (issue.code.startsWith("E_RELATION")) suggestions.add("relation의 `from_entity_type` / `to_entity_type`가 실제 entity type을 참조하도록 수정하세요.");
    if (issue.code.startsWith("R_MULTI_CATEGORY")) suggestions.add("`rules.multi_category` 설정값을 허용 범위로 조정하세요.");
  }
  return [...suggestions];
}

function printValidationReport(bundlePath: string, bundle: TaxonomyFile, issues: ValidationIssue[]) {
  const summary = summarizeIssues(issues);
  const grouped = groupIssuesByLevel(issues);
  const suggestions = collectImprovementSuggestions(issues);

  console.log("\n=== Bundle Validation Report ===");
  console.log(`Bundle: ${bundlePath}`);
  console.log(`Schema: ${bundle.schema_version}`);
  console.log(
    `Counts: categories=${bundle.categories.length}, attributes=${bundle.attributes.length}, vocabularies=${bundle.vocabularies.length}, entity_types=${bundle.entity_model?.entity_types.length ?? 0}, relation_types=${bundle.entity_model?.relation_types.length ?? 0}`
  );
  console.log(
    `Summary: total=${summary.total}, errors=${summary.errors}, warnings=${summary.warnings}, info=${summary.info}`
  );

  if (issues.length === 0) {
    console.log("\n상태: 검증 통과. 즉시 사용 가능한 번들입니다.");
    return;
  }

  if (grouped.ERROR.length > 0) {
    console.log("\n[Blocking Errors]");
    grouped.ERROR.forEach((issue, index) => {
      const path = issue.path ? ` @ ${issue.path}` : "";
      console.log(`${index + 1}. ${issue.code}${path}`);
      console.log(`   ${issue.message}`);
    });
  }

  if (grouped.WARNING.length > 0) {
    console.log("\n[Warnings]");
    grouped.WARNING.forEach((issue, index) => {
      const path = issue.path ? ` @ ${issue.path}` : "";
      console.log(`${index + 1}. ${issue.code}${path}`);
      console.log(`   ${issue.message}`);
    });
  }

  if (grouped.INFO.length > 0) {
    console.log("\n[Info]");
    grouped.INFO.forEach((issue, index) => {
      const path = issue.path ? ` @ ${issue.path}` : "";
      console.log(`${index + 1}. ${issue.code}${path}`);
      console.log(`   ${issue.message}`);
    });
  }

  if (suggestions.length > 0) {
    console.log("\n[Recommended Improvements]");
    suggestions.forEach((suggestion, index) => {
      console.log(`${index + 1}. ${suggestion}`);
    });
  }

  if (summary.errors > 0) {
    console.log("\n상태: blocking error가 있어 수정 후 다시 검증이 필요합니다.");
  } else {
    console.log("\n상태: blocking error는 없고, warning 수준의 정리만 남았습니다.");
  }
}

function normalize(v: string) {
  return v.trim().toLowerCase().normalize("NFC");
}

function toDataUrl(imagePath: string): string {
  const full = resolve(process.cwd(), imagePath);
  const bytes = readFileSync(full);
  const ext = imagePath.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function analyzeImageWithOpenAI(imagePath: string, observation: string): Promise<string | undefined> {
  if (!process.env.OPENAI_API_KEY) {
    log("WARN", "OPENAI_API_KEY not found. Skipping SDK image analysis.");
    return undefined;
  }

  try {
    const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini";
    log("INFO", "Requesting OpenAI image analysis", { model, imagePath });
    const imported = await import("openai").catch(() => undefined);
    if (!imported?.default) {
      log("ERROR", "openai package is not installed. Install dependency to use SDK image analysis.");
      return undefined;
    }
    const client = new imported.default({ apiKey: process.env.OPENAI_API_KEY });
    const dataUrl = toDataUrl(imagePath);
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are an image metadata analyst. Return concise text with: scene summary, likely fashion categories, and likely metadata keywords."
            }
          ]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `User observation: ${observation || "(none)"}` },
            { type: "input_image", image_url: dataUrl }
          ]
        }
      ],
      max_output_tokens: 300
    });
    const text = response.output_text?.trim();
    log("INFO", "OpenAI image analysis completed", { has_output: Boolean(text), output_length: text?.length ?? 0 });
    return text || undefined;
  } catch (error) {
    log("ERROR", "OpenAI SDK image analysis failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function recommend(bundle: TaxonomyFile, observation: string, imagePath: string): Recommendation {
  const text = normalize(`${observation} ${imagePath}`);
  log("DEBUG", "Running recommendation", { observation_length: observation.length, image_path: imagePath });
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

async function recommendWithSdk(
  bundle: TaxonomyFile,
  observation: string,
  imagePath: string,
  imageExists: boolean
): Promise<Recommendation> {
  let aiAnalysis: string | undefined;
  if (imageExists) {
    aiAnalysis = await analyzeImageWithOpenAI(imagePath, observation);
  }

  const combined = aiAnalysis ? `${observation}\n${aiAnalysis}` : observation;
  const base = recommend(bundle, combined, imagePath);
  return {
    ...base,
    aiAnalysis
  };
}

function makePlan(feedback: string): string[] {
  const f = normalize(feedback);
  const plan: string[] = [];
  log("DEBUG", "Generating plan from feedback", { feedback });

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
  log("INFO", "Plan generated", { steps: plan.length });
  return plan;
}

function ensureRuntimeGuideBullet(note: string) {
  const path = resolve(process.cwd(), "docs/runtime-considerations.md");
  log("DEBUG", "Updating runtime guide note", { path, note });
  const original = readFileSync(path, "utf8");
  const marker = "## 4) OpenSearch indexing (type-safe)";
  if (!original.includes(marker)) return false;
  const updated = `${original}\n- ${note}\n`;
  writeFileSync(path, updated, "utf8");
  log("INFO", "Runtime guide note appended", { path });
  return true;
}

function promptBundlePathFromArgs(): string | undefined {
  const idx = process.argv.indexOf("--validate-only");
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function validateBundleForCli(bundlePath: string) {
  const bundle = loadBundle(bundlePath);
  const issues = validateTaxonomy(bundle);
  log("INFO", "Bundle validation completed", {
    bundlePath,
    total_issues: issues.length,
    errors: issues.filter((issue) => issue.level === "ERROR").length
  });
  printValidationReport(bundlePath, bundle, issues);
  return { bundle, issues };
}

async function executeApprovedActions(
  rl: ReturnType<typeof createInterface>,
  bundlePath: string,
  bundle: TaxonomyFile
): Promise<TaxonomyFile> {
  log("INFO", "Entering approved-action execution stage");
  console.log("\n승인된 계획 실행 옵션:");
  console.log("  1) vocab alias 추가");
  console.log("  2) runtime guide 문서에 지침 추가");
  console.log("  3) 이번 라운드 작업 건너뛰기");

  const mode = await rl.question("선택 (1/2/3): ");
  log("INFO", "Action mode selected", { mode });

  if (mode === "1") {
    const vocabId = await rl.question("vocab id: ");
    const termValue = await rl.question("canonical term value: ");
    const alias = await rl.question("new alias: ");

    const vocab = bundle.vocabularies.find((v) => v.id === vocabId);
    const term = vocab?.terms.find((t) => normalize(t.value) === normalize(termValue));
    if (!vocab || !term) {
      log("WARN", "Alias update failed due to missing vocab/term", { vocabId, termValue });
      console.log("⚠️ vocab/term을 찾지 못했습니다. 수동 편집이 필요합니다.");
      return bundle;
    }

    term.aliases = term.aliases ?? [];
    if (!term.aliases.some((a) => normalize(a) === normalize(alias))) {
      term.aliases.push(alias);
      saveBundle(bundlePath, bundle);
      log("INFO", "Alias added", { vocabId, termValue, alias });
      console.log(`✅ alias 추가 완료: ${vocabId}.${termValue} += ${alias}`);
    } else {
      log("INFO", "Alias already exists", { vocabId, termValue, alias });
      console.log("ℹ️ 이미 존재하는 alias입니다.");
    }
  } else if (mode === "2") {
    const note = await rl.question("추가할 지침 한 줄: ");
    const ok = ensureRuntimeGuideBullet(note);
    if (ok) {
      console.log("✅ docs/runtime-considerations.md 에 지침을 추가했습니다.");
    } else {
      log("WARN", "Runtime guide update failed: marker not found");
      console.log("⚠️ runtime guide 수정 실패 (marker 미발견).");
    }
  } else {
    log("INFO", "Action skipped by user");
    console.log("ℹ️ 이번 라운드는 작업을 건너뜁니다.");
  }

  log("INFO", "Reloading bundle after action");
  return loadBundle(bundlePath);
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const loadedFromDotEnv = loadEnvFile(".env");
    log("INFO", "Environment bootstrap complete", {
      dotenv_loaded_keys: loadedFromDotEnv,
      has_openai_key: Boolean(process.env.OPENAI_API_KEY)
    });
    log("INFO", "Bundle Manager CLI starting", { verbose: VERBOSE });
    console.log("=== Bundle Manager CLI ===");
    console.log("지원 시나리오: 수동 bundle 검증 또는 이미지 기반 추천/개선 루프");

    const argBundlePath = promptBundlePathFromArgs();
    if (VALIDATE_ONLY) {
      const bundlePath = argBundlePath ?? "examples/fashion.json";
      if (!existsSync(resolve(process.cwd(), bundlePath))) {
        log("ERROR", "Bundle path does not exist", { bundlePath });
        console.error(`Bundle not found: ${bundlePath}`);
        process.exit(1);
      }

      const { issues } = validateBundleForCli(bundlePath);
      if (issues.some((issue) => issue.level === "ERROR")) {
        process.exit(2);
      }
      return;
    }

    console.log("1) bundle 검증");
    console.log("2) 이미지 추천 + 피드백 루프");
    const mode = (await rl.question("작업 모드 선택 (default: 1): ")).trim() || "1";

    const bundlePathInput = await rl.question("관리할 bundle 경로 (default: examples/fashion.json): ");
    const bundlePath = bundlePathInput.trim() || "examples/fashion.json";
    log("INFO", "Bundle path selected", { bundlePath });

    if (!existsSync(resolve(process.cwd(), bundlePath))) {
      log("ERROR", "Bundle path does not exist", { bundlePath });
      console.error(`Bundle not found: ${bundlePath}`);
      process.exit(1);
    }

    let bundle = loadBundle(bundlePath);
    console.log(`Loaded bundle: ${bundlePath} (schema ${bundle.schema_version})`);

    if (mode === "1") {
      const { issues } = validateBundleForCli(bundlePath);
      if (issues.some((issue) => issue.level === "ERROR")) {
        console.log("\n필요하면 같은 CLI에서 번들을 수정한 뒤 다시 검증할 수 있습니다.");
      }
      return;
    }

    let round = 0;
    while (true) {
      round += 1;
      log("INFO", "Starting analysis round", { round });
      const imagePath = await rl.question("\n분석할 이미지 경로: ");
      if (!imagePath.trim()) {
        log("INFO", "Empty image path. Exiting loop", { round });
        console.log("이미지 경로가 비어 있어 종료합니다.");
        break;
      }

      if (!existsSync(resolve(process.cwd(), imagePath))) {
        log("WARN", "Image file not found; continuing with text-only mode", { imagePath, round });
        console.log("⚠️ 이미지 파일이 존재하지 않습니다. 그래도 텍스트 기반 분석은 계속할 수 있습니다.");
      } else {
        log("INFO", "Image file found", { imagePath, round });
      }

      const observation = await rl.question("관찰 내용(자유 입력, OpenAI 분석 보조): ");
      const imageExists = existsSync(resolve(process.cwd(), imagePath));
      const recommendation = await recommendWithSdk(bundle, observation, imagePath, imageExists);
      log("INFO", "Recommendation completed", {
        round,
        recommended_categories: recommendation.categories.length,
        recommended_attributes: recommendation.attributes.length,
        ai_analysis_used: Boolean(recommendation.aiAnalysis)
      });

      console.log("\n[자동 추천]");
      if (recommendation.aiAnalysis) {
        console.log(`- ai_analysis: ${recommendation.aiAnalysis}`);
      }
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
        log("INFO", "Feedback empty; closing loop", { round });
        console.log("피드백 없음 -> 반복 종료.");
        break;
      }
      log("INFO", "Feedback received", { round, feedback_length: feedback.length });

      const plan = makePlan(feedback);
      console.log("\n[개선 작업 계획]");
      plan.forEach((p, i) => console.log(`${i + 1}. ${p}`));

      const approved = await rl.question("계획 승인 후 실행할까요? (y/N): ");
      if (normalize(approved) === "y" || normalize(approved) === "yes") {
        log("INFO", "Plan approved", { round });
        bundle = await executeApprovedActions(rl, bundlePath, bundle);
      } else {
        log("INFO", "Plan rejected", { round });
        console.log("승인되지 않아 작업은 보류합니다.");
      }

      log("INFO", "Round complete; moving to next iteration", { round });
      console.log("\n업데이트된 번들로 다음 분석 라운드를 진행합니다.");
    }
  } finally {
    log("INFO", "Bundle Manager CLI shutting down");
    rl.close();
  }
}

main();
