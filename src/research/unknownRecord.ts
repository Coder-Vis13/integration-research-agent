import { appRecordSchema, type AppRecord } from "../schema/appRecord.js";

export function unknownRecord(
  reason: string,
  checkedAt: string,
  promptVersion: string,
  passId: string,
): AppRecord {
  return appRecordSchema.parse({
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
    blocker: "The pipeline could not produce a record.",
    evidence: [],
    confidence: "low",
    checkedAt,
    promptVersion,
    passId,
    unknownReason: reason,
  });
}
