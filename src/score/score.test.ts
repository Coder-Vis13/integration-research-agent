import assert from "node:assert/strict";
import test from "node:test";
import type { ClayLabelsApp, ClayLabelsFile } from "../clay/exportClayLabels.js";
import type { AppRecord } from "../schema/appRecord.js";
import { scoreSampleAgainstClay } from "./scoreSample.js";

function clayField(agentField: string, raw: string, state: "blank" | "unknown" | "value" = "value"): ClayLabelsApp["fields"][string] {
  return {
    agentField,
    clayColumn: agentField,
    comparable: true,
    scored: agentField === "auth",
    raw,
    state,
  };
}

function minimalRecord(overrides: Partial<AppRecord>): AppRecord {
  const base: AppRecord = {
    oneLiner: "Example",
    auth: ["unknown"],
    access: "unknown",
    apiSurface: "unknown",
    mcp: "unknown",
    webhooks: "unknown",
    sandbox: "unknown",
    pricingForApi: "unknown",
    rateLimit: "unknown",
    buildability: "unknown",
    blocker: "blocker",
    evidence: [],
    confidence: "low",
    checkedAt: "2026-11-25",
    promptVersion: "test",
    passId: "test",
    unknownReason: "reason",
  };
  return { ...base, ...overrides };
}

function labelsApp(id: number, fields: Partial<Record<string, { raw: string; state?: "blank" | "unknown" | "value" }>>): ClayLabelsApp {
  const scored = ["auth", "access", "apiSurface", "mcp", "buildability"] as const;
  const built: ClayLabelsApp["fields"] = {};
  for (const field of scored) {
    const item = fields[field];
    built[field] = clayField(
      field,
      item?.raw ?? "unknown",
      item?.state ?? (item?.raw === "" ? "blank" : item?.raw === "unknown" ? "unknown" : "value"),
    );
  }
  return {
    id,
    name: `App${id}`,
    clayRow: id,
    notComparable: {},
    fields: built,
    evidence: {
      url: { clayColumn: "Use AI Evidence Url", raw: "", state: "blank" },
      httpStatus: { clayColumn: "Use AI Evidence Http Status", raw: "", state: "blank" },
      quote: { clayColumn: "Use AI Evidence Quote", raw: "", state: "blank" },
    },
  };
}

function minimalLabels(apps: ClayLabelsApp[]): ClayLabelsFile {
  return {
    provenance: {
      source: "clay_csv",
      sourceFile: "fixture",
      verificationStatus: "not_independently_verified",
      note: "fixture",
      checkedAt: "2026-11-25",
      sampleSize: apps.length,
    },
    comparableMappings: [],
    notComparableColumns: [],
    ambiguousColumns: [],
    apps,
  };
}

test("auth exact set match and multi-value", () => {
  const labels = minimalLabels([
    labelsApp(1, { auth: { raw: "[\"oauth2\",\"api_key\"]" } }),
  ]);
  const report = scoreSampleAgainstClay(
    labels,
    [{ id: 1, name: "App1", record: minimalRecord({ auth: ["api_key", "oauth2"], access: "unknown" }) }],
    "pass1",
    "fixture",
    "fixture",
  );
  assert.equal(report.scoredFields.auth?.agreementAmongAnswered.numerator, 1);
  assert.equal(report.scoredFields.auth?.agreementAmongAnswered.denominator, 1);
  const match = report.fieldResults.find((r) => r.field === "auth");
  assert.equal(match?.kind, "match");
});

test("unknown agent is abstention, not a match", () => {
  const labels = minimalLabels([
    labelsApp(1, { auth: { raw: "[\"oauth2\"]" }, access: { raw: "self_serve_free" } }),
  ]);
  const report = scoreSampleAgainstClay(
    labels,
    [{ id: 1, name: "App1", record: minimalRecord({ auth: ["unknown"], access: "unknown" }) }],
    "pass1",
    "fixture",
    "fixture",
  );
  assert.equal(report.scoredFields.auth?.abstentions.count, 1);
  assert.equal(report.scoredFields.auth?.agreementAmongAnswered.denominator, 0);
  assert.equal(report.scoredFields.access?.abstentions.count, 1);
});

test("blank clay auth is unscorable", () => {
  const labels = minimalLabels([labelsApp(1, { auth: { raw: "", state: "blank" } })]);
  const report = scoreSampleAgainstClay(
    labels,
    [{ id: 1, name: "App1", record: minimalRecord({ auth: ["oauth2"] }) }],
    "pass1",
    "fixture",
    "fixture",
  );
  assert.equal(report.scoredFields.auth?.unscorableClay.count, 1);
  assert.equal(report.scoredFields.auth?.mismatches.count, 0);
  assert.equal(report.scoredFields.auth?.agreementAmongAnswered.denominator, 0);
});

test("mismatch is reported with app and field", () => {
  const labels = minimalLabels([
    labelsApp(1, {
      auth: { raw: "[\"oauth2\"]" },
      access: { raw: "self_serve_free" },
      apiSurface: { raw: "rest" },
      mcp: { raw: "none_found" },
      buildability: { raw: "build_now" },
    }),
  ]);
  const report = scoreSampleAgainstClay(
    labels,
    [{
      id: 1,
      name: "App1",
      record: minimalRecord({
        auth: ["oauth2"],
        access: "self_serve_free",
        apiSurface: "rest",
        mcp: "none_found",
        buildability: "needs_outreach",
      }),
    }],
    "pass1",
    "fixture",
    "fixture",
  );
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0]?.field, "buildability");
  assert.equal(report.mismatches[0]?.appId, 1);
});

test("missing agent row marks unscorable on every scored field", () => {
  const labels = minimalLabels([labelsApp(1, { auth: { raw: "[\"oauth2\"]" } })]);
  const report = scoreSampleAgainstClay(labels, [], "pass1", "fixture", "fixture");
  assert.equal(report.scoredFields.auth?.unscorableClay.count, 1);
  assert.equal(report.fieldResults[0]?.unscorableReason, "agent_row_missing");
});