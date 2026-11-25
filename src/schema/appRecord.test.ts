import assert from "node:assert/strict";
import test from "node:test";
import { appRecordSchema, type AppRecord } from "./appRecord.js";

function lowRecord(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    oneLiner: "unknown",
    auth: ["unknown"],
    access: "unknown",
    apiSurface: "unknown",
    mcp: "unknown",
    webhooks: "unknown",
    sandbox: "unknown",
    pricingForApi: "unknown",
    rateLimit: "unknown",
    buildability: "unknown",
    blocker: "docs did not say",
    evidence: [],
    confidence: "low",
    checkedAt: "2026-11-24",
    promptVersion: "none",
    passId: "fixture",
    unknownReason: "fixture has no page text",
    ...overrides,
  };
}

test("rejects high confidence with no evidence URL and quote", () => {
  const parsed = appRecordSchema.safeParse(
    lowRecord({ confidence: "high", evidence: [] }),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    assert.ok(
      messages.some((message) => message.includes("evidence URL and a quote")),
    );
  }
});

test("accepts low confidence when fields are unknown and evidence is empty", () => {
  const parsed = appRecordSchema.safeParse(lowRecord());
  assert.equal(parsed.success, true);
});
