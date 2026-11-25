import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  exportClayLabelsFromCsv,
  exportClayLabelsFromPaths,
  validateClayLabelsFile,
} from "./exportClayLabels.js";
import { loadSampleIds } from "./exportClayLabels.js";
import { parseCsv } from "./loadClaySample.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const csvPath = `${root}/data/clay_sample.csv`;
const samplePath = `${root}/data/sample.json`;
const csvBytesBefore = readFileSync(csvPath);

test("Clay CSV export preserves row count and header", () => {
  const after = readFileSync(csvPath);
  assert.equal(createHash("sha256").update(after).digest("hex"), createHash("sha256").update(csvBytesBefore).digest("hex"));
  const table = parseCsv(after.toString("utf8"));
  assert.equal(table.length, 29);
  assert.equal(table[0]?.length, 28);
});

test("Clay labels cover the fixed sample with traceable columns", () => {
  const sample = JSON.parse(readFileSync(samplePath, "utf8")) as { selectionRule: string };
  const sampleIds = loadSampleIds(readFileSync(samplePath, "utf8"));
  const labels = exportClayLabelsFromPaths(csvPath, samplePath, sample.selectionRule);
  assert.equal(validateClayLabelsFile(labels, sampleIds).length, 0);
  assert.equal(labels.provenance.source, "clay_csv");
  assert.equal(labels.provenance.verificationStatus, "not_independently_verified");
  assert.equal(labels.apps.length, 28);
  assert.deepEqual(labels.apps.map((app) => app.id), sampleIds);
  const salesforce = labels.apps.find((app) => app.id === 1);
  assert.ok(salesforce);
  assert.equal(salesforce.fields.auth?.clayColumn, "Authentication Method");
  assert.equal(salesforce.fields.auth?.raw, "[\"oauth2\"]");
  assert.equal(salesforce.fields.auth?.scored, true);
  assert.equal(salesforce.evidence.quote.raw.includes("15,000 calls/day"), true);
  assert.equal(salesforce.notComparable.category.state, "value");
});

test("blank blocker stays blank", () => {
  const header = [
    "id", "name", "category", "hint", "hintUrl", "hintNote", "hintUrlAlt", "inSample",
    "API Documentation Access", "Use AI One Liner", "Use AI Access", "Use AI Api Surface",
    "Use AI Api Breadth", "Use AI Mcp", "Use AI Mcp Url", "Use AI Webhooks",
    "Use AI Open Api Spec Url", "Use AI Sandbox", "Use AI Pricing For Api", "Use AI Rate Limit",
    "Use AI Buildability", "Use AI Blocker", "Use AI Evidence Url", "Use AI Evidence Http Status",
    "Use AI Evidence Quote", "Use AI Confidence", "Use AI Unknown Reason", "Authentication Method",
  ];
  const row = header.map((col) => {
    if (col === "id") return "99";
    if (col === "name") return "Probe";
    if (col === "Use AI Blocker") return "";
    if (col === "Authentication Method") return "[\"api_key\"]";
    if (col.startsWith("Use AI")) return "unknown";
    return "x";
  });
  const csv = `${header.join(",")}\n${row.join(",")}\n`;
  const labels = exportClayLabelsFromCsv(csv, [99], "rule");
  assert.equal(labels.apps[0]?.fields.blocker?.state, "blank");
  assert.equal(labels.apps[0]?.fields.blocker?.raw, "");
});