import assert from "node:assert/strict";
import test from "node:test";
import { assignWave, type WaveInput } from "./assignWave.js";

function row(overrides: Partial<WaveInput>): WaveInput {
  return {
    access: "self_serve_free",
    apiSurface: "rest",
    auth: ["api_key"],
    evidence: [
      {
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "Create a free account. This REST API uses an API key.",
      },
    ],
    ...overrides,
  };
}

test("step 1: no public API wins before a CLI surface", () => {
  assert.equal(
    assignWave(row({
      access: "no_public_api",
      apiSurface: "cli_only",
      evidence: [{
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "There is no public API.",
      }],
    })),
    "not_buildable_no_public_api",
  );
});

test("step 2: a paid CLI is not buildable as a CLI, not Wave 3", () => {
  assert.equal(
    assignWave(row({
      access: "paid_plan",
      apiSurface: "cli_only",
      evidence: [{
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "This is a command-line tool.",
      }],
    })),
    "not_buildable_cli_or_skill",
  );
});

test("step 3: paid plan with an unknown surface is Wave 3", () => {
  assert.equal(
    assignWave(row({
      access: "paid_plan",
      apiSurface: "unknown",
      auth: ["unknown"],
      evidence: [{
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "A paid plan is required.",
      }],
    })),
    "wave_3",
  );
});

test("step 4: admin approval of an MCP surface is Wave 2", () => {
  assert.equal(
    assignWave(row({
      access: "admin_approval",
      apiSurface: "mcp_only",
      evidence: [{
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "Admin approval is required.",
      }],
    })),
    "wave_2",
  );
});

test("step 5: self-serve with an unknown surface is unknown", () => {
  assert.equal(
    assignWave(row({ access: "self_serve_free", apiSurface: "unknown", auth: ["unknown"] })),
    "unknown_docs_silent",
  );
});

test("step 6: a self-serve SDK is the SDK or MCP bucket", () => {
  assert.equal(
    assignWave(row({
      access: "self_serve_free",
      apiSurface: "sdk_only",
      evidence: [{
        url: "https://example.test/docs",
        httpStatus: 200,
        retrievedAt: "2026-11-24",
        quote: "Install the SDK. Create a free account.",
      }],
    })),
    "sdk_or_mcp_only",
  );
});

test("step 7: self-serve REST with usable auth and HTTP 200 is Wave 1", () => {
  assert.equal(assignWave(row({ auth: ["oauth2"] })), "wave_1");
});

test("step 8: self-serve REST with a non-2xx docs URL is unclassified", () => {
  assert.equal(
    assignWave(
      row({
        evidence: [
          {
            url: "https://example.test/docs",
            httpStatus: 404,
            retrievedAt: "2026-11-24",
            quote: "missing",
          },
        ],
      }),
    ),
    "unknown_no_docs",
  );
});
