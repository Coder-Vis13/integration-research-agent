import type { ZodType } from "zod";
import type { LlmClient, LlmRequest, LlmResult } from "./types.js";

// The stub ignores the app name. It has no page text, so every field stays unknown.
function stubPayload(request: LlmRequest, checkedAt: string): unknown {
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
    blocker: "Stub mode does not research the app.",
    evidence: [],
    confidence: "low",
    checkedAt,
    promptVersion: request.promptVersion,
    passId: request.passId,
    unknownReason: "Stub mode does not fetch or read docs.",
  };
}

export class StubClient implements LlmClient {
  readonly provider = "stub";
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async completeJson<T>(request: LlmRequest, schema: ZodType<T>): Promise<LlmResult<T>> {
    const data = schema.parse(stubPayload(request, new Date().toISOString()));
    return {
      data,
      usage: { inputTokens: 0, outputTokens: 0 },
      raw: JSON.stringify(data),
    };
  }
}
