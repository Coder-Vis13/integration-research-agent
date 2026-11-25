import { z } from "zod";

// Category strings match the research set headings so the app list cannot drift.
export const categorySchema = z.enum([
  "CRM and Sales",
  "Support and Helpdesk",
  "Communications and Messaging",
  "Marketing, Ads, Email and Social",
  "Ecommerce",
  "Data, SEO and Scraping",
  "Developer, Infra and Data platforms",
  "Productivity and Project Management",
  "Finance and Fintech",
  "AI, Research and Media-native",
]);

export const appIdentitySchema = z.object({
  id: z.number().int().min(1).max(100),
  name: z.string().min(1),
  category: categorySchema,
  hint: z.string().min(1),
});

export const authMethodSchema = z.enum([
  "oauth2",
  "api_key",
  "basic",
  "token",
  "other",
  "unknown",
]);

export const accessSchema = z.enum([
  "self_serve_free",
  "self_serve_trial",
  "paid_plan",
  "admin_approval",
  "partner_or_sales",
  "no_public_api",
  "unknown",
]);

export const apiSurfaceSchema = z.enum([
  "rest",
  "graphql",
  "both",
  "sdk_only",
  "cli_only",
  "mcp_only",
  "none",
  "unknown",
]);

export const apiBreadthSchema = z.enum(["narrow", "moderate", "broad", "unknown"]);

export const mcpSchema = z.enum(["official", "community", "none_found", "unknown"]);

export const yesNoUnknownSchema = z.enum(["yes", "no", "unknown"]);

export const pricingForApiSchema = z.enum([
  "free",
  "trial",
  "paid",
  "enterprise",
  "unknown",
]);

export const buildabilitySchema = z.enum([
  "build_now",
  "needs_app_review",
  "needs_outreach",
  "cli_or_skill_only",
  "no_public_api",
  "unknown",
]);

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const evidenceSchema = z.object({
  url: z.string().min(1),
  httpStatus: z.number().int(),
  retrievedAt: z.string().min(1),
  quote: z.string().min(1),
});

export const composioCrossCheckSchema = z.object({
  slug: z.string().nullable(),
  authSchemes: z.array(z.string()),
  composioManagedAuthSchemes: z.array(z.string()),
  noAuth: z.boolean(),
  toolsCount: z.number().int().nonnegative(),
  triggersCount: z.number().int().nonnegative(),
  authDisagreement: z.boolean(),
});

export const appRecordSchema = z
  .object({
    oneLiner: z.string().min(1),
    auth: z.array(authMethodSchema).min(1),
    access: accessSchema,
    apiSurface: apiSurfaceSchema,
    apiBreadth: apiBreadthSchema.optional(),
    mcp: mcpSchema,
    mcpUrl: z.string().min(1).optional(),
    composio: composioCrossCheckSchema.optional(),
    webhooks: yesNoUnknownSchema,
    openApiSpecUrl: z.string().min(1).nullable().optional(),
    sandbox: yesNoUnknownSchema,
    pricingForApi: pricingForApiSchema,
    rateLimit: z.string().min(1),
    buildability: buildabilitySchema,
    blocker: z.string(),
    evidence: z.array(evidenceSchema),
    confidence: confidenceSchema,
    checkedAt: z.string().min(1),
    promptVersion: z.string().min(1),
    passId: z.string().min(1),
    unknownReason: z.string().min(1).optional(),
  })
  .superRefine((record, ctx) => {
    // unknown mixed with a real method hides a guess inside a set.
    if (record.auth.includes("unknown") && record.auth.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["auth"],
        message: "auth unknown must be the only value",
      });
    }

    // High confidence means a person could open the quote. Memory cannot qualify.
    const quoteBacked = record.evidence.some(
      (item) => item.url.length > 0 && item.quote.length > 0,
    );
    if (record.confidence === "high" && !quoteBacked) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "high confidence requires an evidence URL and a quote",
      });
    }
    if (record.passId === "pass0" && record.confidence === "high") {
      ctx.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "pass0 cannot use high confidence",
      });
    }

    const thin =
      record.access === "unknown" || record.apiSurface === "unknown";
    if (thin && !record.unknownReason) {
      ctx.addIssue({
        code: "custom",
        path: ["unknownReason"],
        message: "unknown access or API surface requires unknownReason",
      });
    }

    // An empty blocker is allowed only for a row that is buildable now.
    if (record.buildability === "build_now" && record.blocker !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["blocker"],
        message: "build_now requires an empty blocker",
      });
    }
    if (record.buildability !== "build_now" && record.blocker.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["blocker"],
        message: "a blocker is required unless buildability is build_now",
      });
    }
  });

export type AppIdentity = z.infer<typeof appIdentitySchema>;
export type AppRecord = z.infer<typeof appRecordSchema>;
export type AuthMethod = z.infer<typeof authMethodSchema>;
export type Access = z.infer<typeof accessSchema>;
export type ApiSurface = z.infer<typeof apiSurfaceSchema>;
export type McpStatus = z.infer<typeof mcpSchema>;
export type Buildability = z.infer<typeof buildabilitySchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
