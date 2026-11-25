import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAY_SOURCE_FILE,
  exportClayLabelsFromPaths,
  LABELS_OUTPUT_FILE,
  loadSampleIds,
  validateClayLabelsFile,
  type ClayLabelsFile,
} from "../clay/exportClayLabels.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const csvPath = path.join(root, CLAY_SOURCE_FILE);
const samplePath = path.join(root, "data/sample.json");
const outPath = path.join(root, LABELS_OUTPUT_FILE);

if (!existsSync(csvPath)) throw new Error(`Missing ${CLAY_SOURCE_FILE}.`);
if (existsSync(outPath)) {
  throw new Error(`${LABELS_OUTPUT_FILE} already exists. Inspect it; do not overwrite in Phase 1.`);
}

const sample = JSON.parse(readFileSync(samplePath, "utf8")) as {
  selectionRule: string;
  apps: { id: number }[];
};
const sampleIds = loadSampleIds(readFileSync(samplePath, "utf8"));
const labels: ClayLabelsFile = exportClayLabelsFromPaths(csvPath, samplePath, sample.selectionRule);
const issues = validateClayLabelsFile(labels, sampleIds);
if (issues.length > 0) {
  throw new Error(`Clay labels validation failed:\n${issues.join("\n")}`);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(labels, null, 2));

let blanks = 0;
let unknowns = 0;
const scoredComparable = labels.comparableMappings.filter((m) => m.scored).map((m) => m.agentField);
for (const app of labels.apps) {
  for (const field of Object.values(app.fields)) {
    if (field.state === "blank") blanks += 1;
    if (field.state === "unknown") unknowns += 1;
  }
}

console.log([
  `Wrote ${outPath}.`,
  `Apps: ${labels.apps.length}.`,
  `Comparable agent fields: ${labels.comparableMappings.length}.`,
  `Scored comparable fields: ${scoredComparable.join(", ")}.`,
  `Not comparable Clay columns: ${labels.notComparableColumns.join(", ")}.`,
  `Blank comparable cells: ${blanks}.`,
  `Unknown comparable cells: ${unknowns}.`,
  "Provenance: clay_csv, not_independently_verified.",
].join("\n"));