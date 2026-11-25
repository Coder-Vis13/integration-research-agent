import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_FIXTURE } from "../catalog/fixture.js";
import type { AppRecord } from "../schema/appRecord.js";
import { verifyRecord, type SavedPage } from "./verifyRecord.js";

const PAGE = "https://example.test/docs";

function record(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    oneLiner: "A fictional product.",
    auth: ["unknown"],
    access: "unknown",
    apiSurface: "unknown",
    mcp: "unknown",
    webhooks: "unknown",
    sandbox: "unknown",
    pricingForApi: "unknown",
    rateLimit: "unknown",
    buildability: "unknown",
    blocker: "Not decided.",
    evidence: [],
    confidence: "low",
    checkedAt: "2026-11-24T00:00:00.000Z",
    promptVersion: "phase2-test",
    passId: "verify",
    unknownReason: "Fixture reason.",
    ...overrides,
  };
}

function page(text: string, httpStatus = 200): SavedPage {
  return { url: PAGE, httpStatus, text };
}

test("a quote that is not on the fixture page is dropped and auth becomes unknown", () => {
  const text = "Northwind Widgets sells fictional bolts from a warehouse on Paper Street. ".repeat(8);
  const verified = verifyRecord(
    record({
      auth: ["api_key"],
      confidence: "high",
      evidence: [{
        url: PAGE,
        httpStatus: 200,
        retrievedAt: "2026-11-24T00:00:00.000Z",
        quote: "This sentence is not on the page.",
      }],
    }),
    [page(text)],
    null,
  );
  assert.equal(verified.evidence.length, 0);
  assert.deepEqual(verified.auth, ["unknown"]);
  assert.equal(verified.confidence, "low");
});

test("oauth2 with no OAuth phrase is removed", () => {
  const text = "Send your api key in the header. This REST API lists fictional bolts. ".repeat(8);
  const verified = verifyRecord(
    record({
      auth: ["oauth2"],
      access: "self_serve_free",
      apiSurface: "rest",
      confidence: "medium",
      evidence: [{
        url: PAGE,
        httpStatus: 200,
        retrievedAt: "2026-11-24T00:00:00.000Z",
        quote: "Send your api key in the header.",
      }],
    }),
    [page(text)],
    null,
  );
  assert.deepEqual(verified.auth, ["api_key"]);
  assert.equal(verified.auth.includes("oauth2"), false);
  assert.equal(verified.confidence, "medium");
});

test("catalog auth does not overwrite a conflicting docs value", () => {
  const text = "Send your api key in the header. This REST API lists fictional bolts. ".repeat(8);
  const hit = CATALOG_FIXTURE[0];
  assert.ok(hit);
  const verified = verifyRecord(
    record({
      auth: ["api_key"],
      access: "self_serve_free",
      apiSurface: "rest",
      confidence: "medium",
      evidence: [{
        url: PAGE,
        httpStatus: 200,
        retrievedAt: "2026-11-24T00:00:00.000Z",
        quote: "Send your api key in the header.",
      }],
    }),
    [page(text)],
    hit,
  );
  assert.deepEqual(verified.auth, ["api_key"]);
  assert.equal(verified.composio?.authDisagreement, true);
  assert.deepEqual(verified.composio?.authSchemes, ["OAUTH2"]);
});

test("a fictional CLI page becomes cli_only", () => {
  const text = "ExampleCLI is a command-line interface. Run examplecli scan from the terminal. ".repeat(8);
  const verified = verifyRecord(
    record({
      access: "self_serve_free",
      apiSurface: "rest",
      evidence: [{
        url: PAGE,
        httpStatus: 200,
        retrievedAt: "2026-11-24T00:00:00.000Z",
        quote: "ExampleCLI is a command-line interface.",
      }],
    }),
    [page(text)],
    null,
  );
  assert.equal(verified.apiSurface, "cli_only");
  assert.equal(verified.evidence.length, 1);
});

test("an API key quote is kept when the model said token", () => {
  const text = "Follow the steps below to create your API key. Bearer token authentication is required. ".repeat(8);
  const verified = verifyRecord(
    record({
      auth: ["token"],
      access: "paid_plan",
      apiSurface: "rest",
      evidence: [{
        url: PAGE,
        httpStatus: 200,
        retrievedAt: "2026-11-24T00:00:00.000Z",
        quote: "Follow the steps below to create your API key.",
      }],
    }),
    [page(text)],
    null,
  );
  assert.deepEqual(verified.auth, ["api_key"]);
  assert.equal(verified.auth.includes("token"), false);
});

test("a short page becomes unknown, not no_public_api", () => {
  const verified = verifyRecord(
    record({
      access: "no_public_api",
      apiSurface: "none",
      mcp: "none_found",
      confidence: "medium",
    }),
    [page("Hello from ExampleApp.")],
    null,
  );
  assert.equal(verified.access, "unknown");
  assert.equal(verified.apiSurface, "unknown");
  assert.notEqual(verified.access, "no_public_api");
  assert.notEqual(verified.apiSurface, "none");
  assert.equal(verified.mcp, "unknown");
  assert.equal(verified.confidence, "low");
});
