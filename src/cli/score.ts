import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LABELS_OUTPUT_FILE, type ClayLabelsFile } from "../clay/exportClayLabels.js";
import { appRecordSchema } from "../schema/appRecord.js";
import { scoreSampleAgainstClay } from "../score/scoreSample.js";

const PASS_IDS = ["pass1", "pass2"] as const;

const runFileSchema = z.object({
  apps: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    record: appRecordSchema,
  })),
});

function parsePass(argv: readonly string[]): (typeof PASS_IDS)[number] {
  const index = argv.indexOf("--pass");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || !PASS_IDS.includes(value as (typeof PASS_IDS)[number])) {
    throw new Error("Usage: npm run score -- --pass pass1|pass2");
  }
  return value as (typeof PASS_IDS)[number];
}

function assertLabelsGate(labelsPath: string): void {
  if (!existsSync(labelsPath)) {
    throw new Error(`Missing ${LABELS_OUTPUT_FILE}. Run npm run clay-labels first.`);
  }
  const log = execSync(`git log -1 --format=%H -- ${LABELS_OUTPUT_FILE}`, {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    encoding: "utf8",
  }).trim();
  if (log.length === 0 && process.env.SCORE_ALLOW_UNCOMMITTED !== "yes") {
    throw new Error([
      `${LABELS_OUTPUT_FILE} is not committed.`,
      "The binding plan requires a commit before scoring.",
      "Set SCORE_ALLOW_UNCOMMITTED=yes only for local Phase 2 runs.",
    ].join(" "));
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const passId = parsePass(process.argv);
const labelsPath = path.join(root, LABELS_OUTPUT_FILE);
const recordsPath = path.join(root, `data/runs/${passId}/records.json`);
const outDir = path.join(root, `data/runs/${passId}`);

assertLabelsGate(labelsPath);
if (!existsSync(recordsPath)) {
  throw new Error(`Missing ${recordsPath}.`);
}

const sample = JSON.parse(readFileSync(path.join(root, "data/sample.json"), "utf8")) as {
  apps: { id: number }[];
};
const sampleIds = sample.apps.map((app) => app.id);
const labels = JSON.parse(readFileSync(labelsPath, "utf8")) as ClayLabelsFile;
if (labels.apps.length !== sampleIds.length) {
  throw new Error(`Labels have ${labels.apps.length} apps; sample has ${sampleIds.length}.`);
}
for (const id of sampleIds) {
  if (!labels.apps.some((app) => app.id === id)) {
    throw new Error(`Labels are missing sample id ${id}.`);
  }
}

const run = runFileSchema.parse(JSON.parse(readFileSync(recordsPath, "utf8")));
const ids = run.apps.map((app) => app.id);
const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
if (dup.length > 0) throw new Error(`Duplicate app ids in run: ${[...new Set(dup)].join(", ")}.`);

const report = scoreSampleAgainstClay(
  labels,
  run.apps.filter((app) => sampleIds.includes(app.id)),
  passId,
  recordsPath,
  labelsPath,
);

mkdirSync(outDir, { recursive: true });
const metricsPath = path.join(outDir, "metrics.json");
const errorsPath = path.join(outDir, "errors.json");
writeFileSync(metricsPath, JSON.stringify(report, null, 2));
writeFileSync(
  errorsPath,
  JSON.stringify({
    metricLabel: report.metricLabel,
    mismatches: report.mismatches.map((item) => ({
      appId: item.appId,
      appName: item.appName,
      field: item.field,
      agentValue: item.agentValue,
      clayValue: item.clayValue,
      errorType: "mismatch",
    })),
  }, null, 2),
);

console.log(`Agreement metric: ${report.metricLabel} (not factual accuracy).`);
for (const field of Object.keys(report.scoredFields)) {
  const m = report.scoredFields[field];
  if (!m) continue;
  const ag = m.agreementAmongAnswered;
  const cov = m.coverageOfEvaluable;
  console.log([
    field,
    `agreement ${ag.numerator}/${ag.denominator}`,
    `coverage ${cov.numerator}/${cov.denominator}`,
    `abstentions ${m.abstentions.count}`,
    `mismatches ${m.mismatches.count}`,
    `unscorableClay ${m.unscorableClay.count}`,
  ].join(" | "));
}
const ev = report.evidenceCompliance;
console.log([
  "evidence",
  `clayEvaluable ${ev.clayEvidenceEvaluable.numerator}/${ev.clayEvidenceEvaluable.denominator}`,
  `urlMatch ${ev.agentUrlMatchesClay.numerator}/${ev.agentUrlMatchesClay.denominator}`,
  `agent2xx ${ev.agentHas2xxEvidence.numerator}/${ev.agentHas2xxEvidence.denominator}`,
  `agentQuote ${ev.agentQuoteNonEmpty.numerator}/${ev.agentQuoteNonEmpty.denominator}`,
].join(" | "));
console.log(`Wrote ${metricsPath} and ${errorsPath}.`);