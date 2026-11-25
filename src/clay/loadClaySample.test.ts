import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadClaySample, loadClaySampleFile } from "./loadClaySample.js";

const header = [
  "id",
  "name",
  "Use AI One Liner",
  "Use AI Auth",
  "Use AI Access",
  "Use AI Api Surface",
  "Use AI Api Breadth",
  "Use AI Mcp",
  "Use AI Mcp Url",
  "Use AI Webhooks",
  "Use AI Open Api Spec Url",
  "Use AI Sandbox",
  "Use AI Pricing For Api",
  "Use AI Rate Limit",
  "Use AI Buildability",
  "Use AI Blocker",
  "Use AI Evidence Url",
  "Use AI Evidence Http Status",
  "Use AI Evidence Quote",
  "Use AI Confidence",
  "Use AI Unknown Reason",
].join(",");

function csvRow(quote: string, confidence: string): string {
  return [
    "1",
    "Example",
    "Example does a thing.",
    "api_key",
    "self_serve_free",
    "rest",
    "narrow",
    "none_found",
    "",
    "unknown",
    "",
    "unknown",
    "unknown",
    "unknown",
    "build_now",
    "",
    quote === "" ? "" : "https://example.test/docs",
    quote === "" ? "" : "200",
    quote,
    confidence,
    "",
  ].join(",");
}

test("high confidence with an empty quote is stored as low", () => {
  const [loaded] = loadClaySample(`${header}\n${csvRow("", "high")}\n`, [1]);
  assert.ok(loaded);
  assert.equal(loaded.record.confidence, "low");
  assert.deepEqual(loaded.record.evidence, []);
  assert.deepEqual(loaded.record.auth, ["api_key"]);
});

test("a kept quote can stay high when auth is in the file", () => {
  const [loaded] = loadClaySample(`${header}\n${csvRow("Use an api key.", "high")}\n`, [1]);
  assert.ok(loaded);
  assert.equal(loaded.record.confidence, "high");
  assert.equal(loaded.record.evidence.length, 1);
});

test("the exported sample reads Authentication Method and keeps quoted confidence", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../../data/sample.json", import.meta.url), "utf8"),
  ) as { apps: { id: number }[] };
  const ids = sample.apps.map((app) => app.id);
  const csvPath = fileURLToPath(new URL("../../data/clay_sample.csv", import.meta.url));
  const loaded = loadClaySampleFile(csvPath, ids);
  assert.deepEqual(loaded.map((item) => item.id), ids);
  assert.equal(loaded.length, 28);
  const byId = new Map(loaded.map((item) => [item.id, item.record]));
  assert.deepEqual(byId.get(1)?.auth, ["oauth2"]);
  assert.deepEqual(byId.get(20)?.auth, ["basic"]);
  assert.deepEqual(byId.get(40)?.auth, ["api_key"]);
  assert.deepEqual(byId.get(58)?.auth, ["unknown"]);
  assert.deepEqual(byId.get(61)?.auth, ["token"]);
  assert.deepEqual(byId.get(97)?.auth, ["other"]);
  assert.equal(loaded.filter((item) => item.record.confidence === "high").length, 14);
  assert.equal(loaded.filter((item) => item.record.confidence === "medium").length, 14);
  for (const item of loaded) {
    assert.equal(item.record.passId, "clay-sample");
    assert.notEqual(item.record.unknownReason, "The Clay export has no auth column.");
  }
});

test("an id outside the sample is rejected", () => {
  assert.throws(
    () => loadClaySample(`${header}\n${csvRow("Use an api key.", "medium")}\n`, [2]),
    /not in the sample/,
  );
});
