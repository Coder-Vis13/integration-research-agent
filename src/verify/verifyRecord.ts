import type { CatalogToolkit } from "../catalog/types.js";
import { normalizeText } from "../evidence/htmlText.js";
import { isUsablePage } from "../evidence/usable.js";
import {
  appRecordSchema,
  type AppRecord,
  type AuthMethod,
} from "../schema/appRecord.js";

type KnownAuth = Exclude<AuthMethod, "unknown">;

export interface SavedPage {
  url: string;
  httpStatus: number;
  text: string;
  source?: "vendor" | "non_vendor";
}

const NO_PUBLIC_API = /no public api|without a public api|does not (have|offer|provide) a public api/i;
const NO_API = /no programmatic api|no public api|there is no api|does not (have|offer|provide) (a public |an )?api/i;
const CLI = /\bcommand-line\b|\bcommand line\b|\bcli\b/i;
const HTTP_API = /\brest\b|\bgraphql\b/i;

function usableText(pages: readonly SavedPage[]): string {
  return pages.filter(isUsablePage).map((page) => page.text).join("\n");
}

function keepEvidence(evidence: AppRecord["evidence"], pages: readonly SavedPage[]): AppRecord["evidence"] {
  const kept: AppRecord["evidence"] = [];
  for (const item of evidence) {
    const page = pages.find((candidate) => candidate.url === item.url);
    if (!page || page.httpStatus < 200 || page.httpStatus >= 300) {
      continue;
    }
    if (!normalizeText(page.text).includes(normalizeText(item.quote))) {
      continue;
    }
    const quote = page.source === "non_vendor" ? `Non-vendor source. ${item.quote}` : item.quote;
    kept.push({ ...item, quote, httpStatus: page.httpStatus });
  }
  return kept;
}

function authFromQuotes(quotes: string): AuthMethod[] {
  const methods: AuthMethod[] = [];
  if (/oauth/i.test(quotes)) methods.push("oauth2");
  if (/api[ _-]?key/i.test(quotes)) methods.push("api_key");
  if (/basic authentication|\bhttp basic\b/i.test(quotes)) methods.push("basic");
  if (/personal access token/i.test(quotes)) methods.push("token");
  return methods.length > 0 ? methods : ["unknown"];
}

function accessFromQuote(access: AppRecord["access"], quotes: string): AppRecord["access"] {
  if (access === "unknown" || quotes.length === 0) return "unknown";
  const patterns: Record<Exclude<AppRecord["access"], "unknown">, RegExp> = {
    self_serve_free: /free|no charge|no credit card|sign up|developer account|all plans/i,
    self_serve_trial: /free trial|\btrial\b/i,
    paid_plan: /\bpaid\b|\bpricing\b|subscribe|\bplan\b/i,
    admin_approval: /app review|admin approval|must approve|approval/i,
    partner_or_sales: /contact sales|partnership|talk to sales/i,
    no_public_api: NO_PUBLIC_API,
  };
  return patterns[access].test(quotes) ? access : "unknown";
}

function surfaceFromQuote(
  surface: AppRecord["apiSurface"],
  quotes: string,
  thin: boolean,
): AppRecord["apiSurface"] {
  if (thin || quotes.length === 0) return "unknown";
  if (CLI.test(quotes) && !HTTP_API.test(quotes)) return "cli_only";
  if (surface === "unknown" || surface === "cli_only") return "unknown";
  if (surface === "none") return NO_API.test(quotes) ? "none" : "unknown";
  if (surface === "rest") return /\brest\b|\bapi\b|\bhttp\b/i.test(quotes) ? "rest" : "unknown";
  if (surface === "graphql") return /graphql/i.test(quotes) ? "graphql" : "unknown";
  if (surface === "both") {
    return /\brest\b/i.test(quotes) && /graphql/i.test(quotes) ? "both" : "unknown";
  }
  if (surface === "sdk_only") return /\bsdk\b/i.test(quotes) ? "sdk_only" : "unknown";
  if (surface === "mcp_only") return /\bmcp\b/i.test(quotes) ? "mcp_only" : "unknown";
  return "unknown";
}

function mapScheme(raw: string): KnownAuth | null {
  const value = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (value === "oauth2") {
    return "oauth2";
  }
  if (value === "apikey") {
    return "api_key";
  }
  if (value === "basic" || value === "basicauth") {
    return "basic";
  }
  if (value === "token" || value === "bearertoken" || value === "personalaccesstoken") {
    return "token";
  }
  return null;
}

function attachCatalog(record: AppRecord, hit: CatalogToolkit | null): AppRecord {
  if (!hit) {
    return {
      ...record,
      composio: {
        slug: null,
        authSchemes: [],
        composioManagedAuthSchemes: [],
        noAuth: false,
        toolsCount: 0,
        triggersCount: 0,
        authDisagreement: false,
      },
    };
  }
  const docs = record.auth.filter((method): method is KnownAuth => method !== "unknown");
  const catalogAuth = hit.authSchemes
    .map(mapScheme)
    .filter((method): method is KnownAuth => method !== null);
  const authDisagreement = catalogAuth.some((method) => !docs.includes(method))
    || docs.some((method) => !catalogAuth.includes(method));
  return {
    ...record,
    composio: {
      slug: hit.slug,
      authSchemes: [...hit.authSchemes],
      composioManagedAuthSchemes: [...hit.composioManagedAuthSchemes],
      noAuth: hit.noAuth,
      toolsCount: hit.toolsCount,
      triggersCount: hit.triggersCount,
      authDisagreement,
    },
  };
}

export function verifyRecord(
  record: AppRecord,
  pages: readonly SavedPage[],
  catalogHit: CatalogToolkit | null,
): AppRecord {
  const text = usableText(pages);
  const thin = text.length === 0;
  const evidence = keepEvidence(record.evidence, pages);
  const next: AppRecord = { ...record, evidence, auth: [...record.auth] };

  if (thin) {
    next.access = "unknown";
    next.apiSurface = "unknown";
    next.unknownReason = record.unknownReason
      ?? "Fetched text was too short or not HTTP 2xx.";
  } else if (CLI.test(text) && !HTTP_API.test(text)) {
    next.apiSurface = "cli_only";
  } else if (next.apiSurface === "cli_only" || (next.apiSurface === "none" && !NO_API.test(text))) {
    next.apiSurface = "unknown";
  }

  if (!thin && next.access === "no_public_api" && !NO_PUBLIC_API.test(text)) {
    next.access = "unknown";
  }

  if (!thin && next.buildability === "no_public_api" && !NO_PUBLIC_API.test(text)) {
    next.buildability = "unknown";
    if (next.blocker.trim().length === 0) {
      next.blocker = "The saved text does not say there is no public API.";
    }
  }

  const decisionEvidence = evidence.filter((item) => !item.quote.startsWith("Non-vendor source."));
  const decisionQuotes = decisionEvidence.map((item) => item.quote).join("\n");
  next.auth = authFromQuotes(decisionQuotes);
  next.access = accessFromQuote(next.access, decisionQuotes);
  next.apiSurface = surfaceFromQuote(next.apiSurface, decisionQuotes, thin);
  if (next.access === "unknown" || next.apiSurface === "unknown") {
    next.unknownReason = next.unknownReason
      ?? "The saved text does not support the claimed access or API surface.";
  } else {
    delete next.unknownReason;
  }
  if (thin || decisionEvidence.length === 0) {
    next.mcp = "unknown";
  } else if (/\bmcp\b/i.test(decisionQuotes)) {
    if (next.mcp !== "official" && next.mcp !== "community") {
      next.mcp = "unknown";
    }
  } else {
    next.mcp = "none_found";
  }

  const authKnown = next.auth.some((method) => method !== "unknown");
  const selfServe = next.access === "self_serve_free" || next.access === "self_serve_trial";
  if (next.access === "no_public_api") {
    next.buildability = "no_public_api";
  } else if (next.apiSurface === "cli_only") {
    next.buildability = "cli_or_skill_only";
  } else if (next.access === "admin_approval") {
    next.buildability = "needs_app_review";
  } else if (next.access === "paid_plan" || next.access === "partner_or_sales") {
    next.buildability = "needs_outreach";
  } else if (selfServe && authKnown) {
    next.buildability = "build_now";
  } else {
    next.buildability = "unknown";
  }
  next.blocker = next.buildability === "build_now"
    ? ""
    : (next.blocker.trim() || "The quoted text does not support a buildability verdict.");

  if (next.rateLimit !== "unknown") {
    const needle = normalizeText(next.rateLimit);
    const backed = evidence.some((item) => normalizeText(item.quote).includes(needle));
    if (!backed) {
      next.rateLimit = "unknown";
    }
  }

  const coreUnknown = (next.auth.length === 1 && next.auth[0] === "unknown")
    || next.access === "unknown"
    || next.apiSurface === "unknown"
    || next.buildability === "unknown";
  if (next.evidence.length === 0 || thin) {
    next.confidence = "low";
  } else if (!coreUnknown) {
    next.confidence = "high";
  } else {
    next.confidence = "medium";
  }

  return appRecordSchema.parse(attachCatalog(next, catalogHit));
}
