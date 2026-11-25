import {
  accessSchema,
  apiBreadthSchema,
  apiSurfaceSchema,
  authMethodSchema,
  buildabilitySchema,
  confidenceSchema,
  mcpSchema,
  pricingForApiSchema,
  yesNoUnknownSchema,
} from "./schema/appRecord.js";

type EnumSchema = { options: readonly string[] };

// One map per enum. A missing key fails the coverage test.
export const rubricDefinitions = {
  auth: {
    oauth2:
      "The docs describe OAuth 2.0. A bearer token produced by OAuth is still oauth2.",
    api_key:
      "A static key or static bearer secret the developer creates or is issued.",
    basic: "HTTP Basic username and password.",
    token:
      "A personal or long-lived token the docs treat as its own method, distinct from OAuth and from an API key.",
    other: "A documented method that is none of the above, backed by a quote.",
    unknown: "The fetched text does not say. On Pass 0, the model was not shown any text.",
  },
  access: {
    self_serve_free:
      "A developer can create working credentials at no charge, with no review and no sales step.",
    self_serve_trial:
      "A developer can create credentials on a free trial, with no sales step.",
    paid_plan:
      "A paid plan is required before credentials work. No partnership is required.",
    admin_approval:
      "The vendor must review or approve the app, developer token, or account before credentials work or go to production. This includes app review, developer-token approval, and admin enablement. No paid contract or partnership is required.",
    partner_or_sales:
      "A partnership, enterprise agreement, or contact-sales step is required to get credentials.",
    no_public_api: "The product has no public programmatic API to get credentials for.",
    unknown: "The docs that were fetched do not say which access path is true.",
  },
  apiSurface: {
    rest: "A documented HTTP REST API.",
    graphql: "A documented GraphQL API.",
    both: "Documented REST and GraphQL.",
    sdk_only:
      "A documented SDK or client library without a public HTTP reference the page treats as the API.",
    cli_only: "A command-line tool, with no documented HTTP API.",
    mcp_only:
      "An MCP server is the documented programmatic surface, with no REST or GraphQL reference.",
    none: "The docs say there is no programmatic API.",
    unknown: "The fetch did not produce enough text to choose. Missing docs stay unknown, not none.",
  },
  apiBreadth: {
    narrow: "One small product area. Not scored.",
    moderate: "Several resource groups, not a whole platform. Not scored.",
    broad: "A large platform API. Not scored.",
    unknown: "The page does not support a band. Do not invent an endpoint count. Not scored.",
  },
  mcp: {
    official: "The vendor’s own docs describe an MCP server.",
    community: "The fetched pages describe a third-party MCP server.",
    none_found: "Usable docs were fetched and they do not mention MCP.",
    unknown: "There were no usable docs, so none_found would be a guess.",
  },
  webhooks: {
    yes: "The page says the product sends outbound events. Not scored.",
    no: "The docs discuss the API and do not describe webhooks. Not scored.",
    unknown: "The docs are too thin to say. Not scored.",
  },
  sandbox: {
    yes: "The page describes a test mode or sandbox credentials. Not scored.",
    no: "The docs discuss the API and do not describe a sandbox. Not scored.",
    unknown: "The docs are too thin to say. Not scored.",
  },
  pricingForApi: {
    free: "The page says API access is free. Not scored. This can differ from access.",
    trial: "The page says API access starts on a trial. Not scored.",
    paid: "The page says API access requires payment. Not scored.",
    enterprise: "The page says API access is an enterprise offer. Not scored.",
    unknown: "The page does not state a price for API access. Not scored.",
  },
  buildability: {
    build_now:
      "Public API, and a developer can get credentials without review or a sales step.",
    needs_app_review:
      "An API exists, and admin approval or app review blocks production use.",
    needs_outreach: "A paid plan, partnership, or sales step blocks credentials.",
    cli_or_skill_only: "A CLI or local skill, not an HTTP API toolkit.",
    no_public_api: "No public programmatic surface.",
    unknown: "The evidence does not support a verdict.",
  },
  confidence: {
    high: "At least one evidence item has a URL and a quote. The verifier has not lowered it.",
    medium:
      "A real quote exists, and an optional field is unknown or a check was only partly satisfied.",
    low: "Thin evidence, or the verifier forced a scored field to unknown. Pass 0 cannot be high.",
  },
} as const;

const ENUMS: Record<keyof typeof rubricDefinitions, EnumSchema> = {
  auth: authMethodSchema,
  access: accessSchema,
  apiSurface: apiSurfaceSchema,
  apiBreadth: apiBreadthSchema,
  mcp: mcpSchema,
  webhooks: yesNoUnknownSchema,
  sandbox: yesNoUnknownSchema,
  pricingForApi: pricingForApiSchema,
  buildability: buildabilitySchema,
  confidence: confidenceSchema,
};

export function missingRubricDefinitions(): string[] {
  const missing: string[] = [];
  for (const group of Object.keys(ENUMS) as (keyof typeof ENUMS)[]) {
    // Groups do not share keys, so the indexed access is checked as a string map.
    const definitions = rubricDefinitions[group] as Record<string, string>;
    for (const value of ENUMS[group].options) {
      const text = definitions[value];
      if (typeof text !== "string" || text.trim() === "") {
        missing.push(`${group}.${value}`);
      }
    }
  }
  return missing;
}

export function renderRubricMarkdown(): string {
  const lines: string[] = [];
  for (const group of Object.keys(rubricDefinitions) as (keyof typeof rubricDefinitions)[]) {
    lines.push(`### ${group}`);
    const entries = rubricDefinitions[group];
    for (const value of Object.keys(entries)) {
      const text = entries[value as keyof typeof entries];
      lines.push(`- \`${value}\`: ${text}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export const SCORED_FIELDS = ["auth", "access", "apiSurface", "mcp", "buildability"] as const;
