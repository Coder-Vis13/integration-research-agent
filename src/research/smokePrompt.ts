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
} from "../schema/appRecord.js";
import type { FetchedPage } from "../evidence/fetchPage.js";

export const SMOKE_PROMPT_VERSION = "smoke-v4";
export const SMOKE_PASS_ID = "smoke";

// A docs page can be larger than the model needs. The quote has to come from this excerpt.
const PAGE_TEXT_CAP = 16_000;
const AUTH_WINDOW = /oauth|api key|personal access token|basic authentication|free trial|sign up|signup|pricing/gi;

// Keep the opening of a long page, then windows around login-method words past the opening.
export function pageExcerpt(text: string): string {
  if (text.length <= PAGE_TEXT_CAP) {
    return text;
  }
  const parts = [text.slice(0, 4_000)];
  let used = 4_000;
  const seen = new Set<number>();
  for (const match of text.matchAll(AUTH_WINDOW)) {
    if (used >= PAGE_TEXT_CAP || match.index === undefined) {
      break;
    }
    const start = Math.max(0, match.index - 400);
    const bucket = Math.floor(start / 800);
    if (seen.has(bucket)) {
      continue;
    }
    seen.add(bucket);
    const chunk = text.slice(start, start + 1_200);
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("\n...\n").slice(0, PAGE_TEXT_CAP);
}

// Listed OpenRouter price for google/gemini-2.5-flash-lite. Used only for the pre-run print.
export const LISTED_INPUT_USD_PER_MILLION = 0.1;
export const LISTED_OUTPUT_USD_PER_MILLION = 0.4;
export const ASSUMED_OUTPUT_TOKENS = 800;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function choices(schema: { options: readonly string[] }): string {
  return schema.options.join(", ");
}

export function smokeSystemPrompt(): string {
  return [
    "You extract one research record from the pages in the user message.",
    "Use only those pages. If they do not say, answer unknown. Do not use memory.",
    "A quote must be copied from the page text. The evidence URL must be one of the page URLs.",
    "If the text says OAuth or OAuth2, include oauth2. If it says API key, include api_key. If it says Basic authentication, include basic. If it says personal access token, include token. A heading or navigation label counts.",
    "self_serve_free means a developer can create working credentials at no charge, with no review and no sales step. self_serve_trial means a free trial with no sales step. paid_plan means a paid plan is required. admin_approval means the vendor must approve the app or token. partner_or_sales means a partnership or contact-sales step is required. If the pages do not say which one, access is unknown.",
    "build_now is allowed only when access is self_serve_free or self_serve_trial and auth is not unknown. Otherwise set buildability to unknown and write a blocker sentence.",
    "confidence high is allowed only when auth, access, apiSurface, mcp, and buildability are all known and evidence has a URL and a quote. If one of those is unknown, use medium when a quote exists, otherwise low.",
    "If access or apiSurface is unknown, set unknownReason to a short sentence.",
    "Do not set access or buildability to no_public_api unless the text says there is no public API. Do not combine no_public_api with self_serve_free or self_serve_trial.",
    "auth unknown must be the only auth value.",
    "rateLimit is unknown unless the quote contains that limit.",
    `auth: ${choices(authMethodSchema)}`,
    `access: ${choices(accessSchema)}`,
    `apiSurface: ${choices(apiSurfaceSchema)}`,
    `apiBreadth: ${choices(apiBreadthSchema)}`,
    `mcp: ${choices(mcpSchema)}`,
    `webhooks, sandbox: ${choices(yesNoUnknownSchema)}`,
    `pricingForApi: ${choices(pricingForApiSchema)}`,
    `buildability: ${choices(buildabilitySchema)}`,
    `confidence: ${choices(confidenceSchema)}`,
    `Set promptVersion to ${SMOKE_PROMPT_VERSION} and passId to ${SMOKE_PASS_ID}. checkedAt may be any non-empty string; code replaces it.`,
    "Do not include a composio field.",
  ].join("\n");
}

export function smokeUserPrompt(
  app: { name: string; category: string; hint: string },
  pages: readonly FetchedPage[],
): string {
  const body = pages.length === 0
    ? "No page was fetched."
    : pages.map((page) => {
      const sliced = pageExcerpt(page.text);
      const note = page.text.length > sliced.length ? " [page text truncated]" : "";
      const source = page.source === "non_vendor" ? "Source: non-vendor." : "Source: vendor.";
      return `URL: ${page.url}\nHTTP: ${page.httpStatus}\n${source}\nRetrieved: ${page.retrievedAt}\nText: ${sliced}${note}`;
    }).join("\n\n");
  return [
    `Name: ${app.name}`,
    `Category: ${app.category}`,
    `Hint: ${app.hint}`,
    `promptVersion: ${SMOKE_PROMPT_VERSION}`,
    `passId: ${SMOKE_PASS_ID}`,
    "",
    body,
  ].join("\n");
}
