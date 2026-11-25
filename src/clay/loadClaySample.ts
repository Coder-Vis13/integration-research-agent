import { readFileSync } from "node:fs";
import {
  accessSchema,
  apiBreadthSchema,
  apiSurfaceSchema,
  appRecordSchema,
  authMethodSchema,
  buildabilitySchema,
  confidenceSchema,
  mcpSchema,
  pricingForApiSchema,
  yesNoUnknownSchema,
  type AppRecord,
  type AuthMethod,
  type Confidence,
} from "../schema/appRecord.js";

// The owner finished the Clay sample check on this day. The CSV has no clock time.
export const CLAY_CHECKED_AT = "2026-11-25";
export const CLAY_PASS_ID = "clay-sample";
export const CLAY_PROMPT_VERSION = "clay-export-1";

const COL = {
  id: "id",
  name: "name",
  oneLiner: "Use AI One Liner",
  access: "Use AI Access",
  apiSurface: "Use AI Api Surface",
  apiBreadth: "Use AI Api Breadth",
  mcp: "Use AI Mcp",
  mcpUrl: "Use AI Mcp Url",
  webhooks: "Use AI Webhooks",
  openApiSpecUrl: "Use AI Open Api Spec Url",
  sandbox: "Use AI Sandbox",
  pricingForApi: "Use AI Pricing For Api",
  rateLimit: "Use AI Rate Limit",
  buildability: "Use AI Buildability",
  blocker: "Use AI Blocker",
  evidenceUrl: "Use AI Evidence Url",
  evidenceHttpStatus: "Use AI Evidence Http Status",
  evidenceQuote: "Use AI Evidence Quote",
  confidence: "Use AI Confidence",
  unknownReason: "Use AI Unknown Reason",
  auth: "Use AI Auth",
  authenticationMethod: "Authentication Method",
} as const;

const AUTH_COLUMNS = [COL.auth, COL.authenticationMethod] as const;

export type ClaySampleRecord = { id: number; record: AppRecord };

export function loadClaySampleFile(
  csvPath: string,
  sampleIds: readonly number[],
  checkedAt = CLAY_CHECKED_AT,
): ClaySampleRecord[] {
  return loadClaySample(readFileSync(csvPath, "utf8"), sampleIds, checkedAt);
}

export function loadClaySample(
  csvText: string,
  sampleIds: readonly number[],
  checkedAt = CLAY_CHECKED_AT,
): ClaySampleRecord[] {
  const table = parseCsv(csvText);
  const header = table[0];
  if (!header) throw new Error("Clay sample CSV is empty.");
  const authColumn = authColumnName(header);
  const rows = table.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));
  const byId = new Map<number, AppRecord>();
  for (const row of rows) {
    const loaded = rowToRecord(header, row, checkedAt, authColumn);
    if (byId.has(loaded.id)) throw new Error(`Duplicate Clay sample id ${loaded.id}.`);
    byId.set(loaded.id, loaded.record);
  }
  for (const id of byId.keys()) {
    if (!sampleIds.includes(id)) throw new Error(`Clay sample CSV has id ${id}, which is not in the sample.`);
  }
  const records: ClaySampleRecord[] = [];
  for (const id of sampleIds) {
    const record = byId.get(id);
    if (!record) throw new Error(`Clay sample CSV is missing sample id ${id}.`);
    records.push({ id, record });
  }
  return records;
}

function rowToRecord(
  header: string[],
  row: string[],
  checkedAt: string,
  authColumn: string | null,
): { id: number; record: AppRecord } {
  const cells = new Map<string, string>();
  for (let i = 0; i < header.length; i += 1) {
    const key = header[i];
    if (key) cells.set(key, row[i] ?? "");
  }
  const id = Number(required(cells, COL.id, "row"));
  const name = required(cells, COL.name, String(id));
  if (!Number.isInteger(id)) throw new Error(`Clay sample id for ${name} is not an integer.`);

  const auth = authColumn ? parseAuth(cells.get(authColumn) ?? "", name) : (["unknown"] as AuthMethod[]);
  const quote = cell(cells, COL.evidenceQuote);
  const url = cell(cells, COL.evidenceUrl);
  const statusText = cell(cells, COL.evidenceHttpStatus);
  const status = statusText === "" ? null : Number(statusText);
  if (statusText !== "" && !Number.isInteger(status)) {
    throw new Error(`Clay sample HTTP status for ${name} is not an integer.`);
  }
  const quoteKept = quote !== "" && url !== "" && status !== null && status >= 200 && status <= 299;
  let confidence: Confidence = confidenceSchema.parse(required(cells, COL.confidence, name));
  // A scored field forced to unknown, or a high claim with no kept quote, cannot stay high or medium.
  if (!authColumn || (confidence === "high" && !quoteKept)) confidence = "low";

  const access = accessSchema.parse(required(cells, COL.access, name));
  const apiSurface = apiSurfaceSchema.parse(required(cells, COL.apiSurface, name));
  let unknownReason = cell(cells, COL.unknownReason);
  if (!authColumn && unknownReason === "") unknownReason = "The Clay export has no auth column.";
  if ((access === "unknown" || apiSurface === "unknown") && unknownReason === "") {
    throw new Error(`Clay sample row ${name} has unknown access or surface and no unknownReason.`);
  }

  const openApi = cell(cells, COL.openApiSpecUrl);
  const mcpUrl = cell(cells, COL.mcpUrl);
  const record = appRecordSchema.parse({
    oneLiner: required(cells, COL.oneLiner, name),
    auth,
    access,
    apiSurface,
    apiBreadth: apiBreadthSchema.parse(required(cells, COL.apiBreadth, name)),
    mcp: mcpSchema.parse(required(cells, COL.mcp, name)),
    ...(mcpUrl === "" ? {} : { mcpUrl }),
    webhooks: yesNoUnknownSchema.parse(required(cells, COL.webhooks, name)),
    openApiSpecUrl: openApi === "" || openApi === "unknown" ? null : openApi,
    sandbox: yesNoUnknownSchema.parse(required(cells, COL.sandbox, name)),
    pricingForApi: pricingForApiSchema.parse(required(cells, COL.pricingForApi, name)),
    rateLimit: required(cells, COL.rateLimit, name),
    buildability: buildabilitySchema.parse(required(cells, COL.buildability, name)),
    blocker: cell(cells, COL.blocker),
    evidence: quoteKept && status !== null ? [{ url, httpStatus: status, retrievedAt: checkedAt, quote }] : [],
    confidence,
    checkedAt,
    promptVersion: CLAY_PROMPT_VERSION,
    passId: CLAY_PASS_ID,
    ...(unknownReason === "" ? {} : { unknownReason }),
  });
  return { id, record };
}

function authColumnName(header: readonly string[]): string | null {
  const found = AUTH_COLUMNS.filter((name) => header.includes(name));
  if (found.length > 1) {
    throw new Error(`Clay sample CSV has more than one auth column: ${found.join(", ")}.`);
  }
  return found[0] ?? null;
}

function parseAuth(raw: string, name: string): AuthMethod[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "unknown") return ["unknown"];
  let parts: string[];
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Clay sample auth for ${name} is not JSON.`);
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(`Clay sample auth for ${name} is not a list of strings.`);
    }
    parts = parsed;
  } else {
    parts = trimmed.split(",").map((item) => item.trim()).filter((item) => item !== "");
  }
  if (parts.length === 0) return ["unknown"];
  return parts.map((item) => authMethodSchema.parse(item));
}

function required(cells: Map<string, string>, column: string, name: string): string {
  const value = cells.get(column);
  if (value === undefined) throw new Error(`Clay sample CSV is missing column ${column}.`);
  if (value.trim() === "") throw new Error(`Clay sample row ${name} has an empty ${column}.`);
  return value.trim();
}

function cell(cells: Map<string, string>, column: string): string {
  return (cells.get(column) ?? "").trim();
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        value += ch ?? "";
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (ch !== "\r") {
      value += ch ?? "";
    }
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
