import type { Access, ApiSurface, AppRecord, AuthMethod } from "./schema/appRecord.js";

// Stable ids. The report prints WAVE_LABELS. First match wins.
// Gates are checked before "unknown" so a paid product with thin docs stays Wave 3.
export const waveBucketSchema = [
  "not_buildable_no_public_api",
  "not_buildable_cli_or_skill",
  "wave_3",
  "wave_2",
  "unknown_no_docs",
  "unknown_docs_silent",
  "sdk_or_mcp_only",
  "wave_1",
  "unclassified",
] as const;

export type WaveBucket = (typeof waveBucketSchema)[number];

export const WAVE_LABELS: Record<WaveBucket, string> = {
  not_buildable_no_public_api: "Not buildable (no public API)",
  not_buildable_cli_or_skill: "Not buildable (CLI or skill only)",
  wave_3: "Wave 3",
  wave_2: "Wave 2",
  unknown_no_docs: "No usable docs found",
  unknown_docs_silent: "Docs found, don't state it",
  sdk_or_mcp_only: "SDK or MCP only",
  wave_1: "Wave 1",
  unclassified: "Unclassified",
};

const USABLE_AUTH: readonly AuthMethod[] = ["oauth2", "api_key", "basic", "token"];

export type WaveInput = Pick<AppRecord, "access" | "apiSurface" | "auth" | "evidence">;

function vendorQuotes(record: WaveInput): string[] {
  return record.evidence
    .filter((item) => item.httpStatus >= 200 && item.httpStatus <= 299)
    .map((item) => item.quote)
    .filter((quote) => !quote.startsWith("Non-vendor source."));
}

function quoted(quotes: readonly string[], pattern: RegExp): boolean {
  return quotes.some((quote) => pattern.test(quote));
}

export function assignWave(record: WaveInput): WaveBucket {
  const access: Access = record.access;
  const surface: ApiSurface = record.apiSurface;
  const quotes = vendorQuotes(record);
  const silent = quotes.length > 0 ? "unknown_docs_silent" : "unknown_no_docs";

  if ((access === "no_public_api" || surface === "none") && quoted(quotes, /no public api|there is no api/i)) {
    return "not_buildable_no_public_api";
  }
  if (surface === "cli_only" && quoted(quotes, /\bcommand-line\b|\bcommand line\b|\bcli\b/i)) {
    return "not_buildable_cli_or_skill";
  }
  if ((access === "paid_plan" || access === "partner_or_sales") && quoted(quotes, /\bpaid\b|contact sales|partnership/i)) {
    return "wave_3";
  }
  if (access === "admin_approval" && quoted(quotes, /admin approval|app review/i)) {
    return "wave_2";
  }
  if (access === "unknown" || surface === "unknown") {
    return silent;
  }
  if ((surface === "sdk_only" || surface === "mcp_only") && quoted(quotes, /\bsdk\b|\bmcp\b/i)) {
    return "sdk_or_mcp_only";
  }
  const usableAuth = record.auth.some((method) => USABLE_AUTH.includes(method));
  const httpApi = surface === "rest" || surface === "graphql" || surface === "both";
  const selfServe = access === "self_serve_free" || access === "self_serve_trial";
  const authQuoted = quoted(quotes, /oauth|api[ _-]?key|personal access token|basic authentication/i);
  const accessQuoted = quoted(quotes, /free|trial|sign up/i);
  const apiQuoted = quoted(quotes, /\brest\b|\bgraphql\b|\bapi\b/i);
  if (selfServe && usableAuth && httpApi && authQuoted && accessQuoted && apiQuoted) {
    return "wave_1";
  }
  return quotes.length > 0 ? "unknown_docs_silent" : "unknown_no_docs";
}
