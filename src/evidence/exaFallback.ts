import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { absoluteHttpUrl, sameRegistrableSite } from "./docFinder.js";
import type { FetchedPage } from "./fetchPage.js";
import {
  createExaSession,
  EXA_CONTENTS_SLUG,
  EXA_SEARCH_SLUG,
  executeInstantTool,
} from "./composioSearch.js";

// Listed Instant prices read from the session search on 2026-11-25. Discount 100 means the list price is waived.
export const LISTED_SEARCH_USD = 0.007;
export const LISTED_CONTENTS_USD_PER_PAGE = 0.001;
export const INSTANT_DISCOUNT_PERCENT = 100;
const RESULT_LIMIT = 3;
const CONTENT_CHAR_CAP = 8_000;

export interface ExaUsage {
  at: string;
  app: string;
  slug: string;
  cached: boolean;
  listedUsd: number;
  discountPercent: number;
  instantCharge: unknown;
  costDollars: number | null;
}

export class ExaBudget {
  readonly usage: ExaUsage[] = [];
  private liveApps = 0;

  constructor(readonly maxApps: number) {}

  canStartApp(): boolean {
    return this.liveApps < this.maxApps;
  }

  markApp(): void {
    this.liveApps += 1;
  }

  add(entry: ExaUsage): void {
    this.usage.push(entry);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function payload(data: Record<string, unknown>): Record<string, unknown> {
  const inner = asRecord(data.data);
  if (inner && (Array.isArray(inner.results) || inner.costDollars)) return inner;
  return data;
}

function resultRows(data: Record<string, unknown>): Record<string, unknown>[] {
  const rows = payload(data).results;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    return record ? [record] : [];
  });
}

function costDollars(data: Record<string, unknown>): number | null {
  const cost = asRecord(payload(data).costDollars);
  return typeof cost?.total === "number" ? cost.total : null;
}

function textOf(row: Record<string, unknown>): string {
  return typeof row.text === "string" ? row.text : "";
}

function urlOf(row: Record<string, unknown>): string | null {
  const url = typeof row.url === "string" ? row.url : "";
  if (!url.startsWith("https://")) return null;
  return url;
}

function cacheFile(cacheDir: string, slug: string, args: Record<string, unknown>): string {
  const name = createHash("sha256").update(slug).update(JSON.stringify(args)).digest("hex") + ".json";
  return path.join(cacheDir, name);
}

async function callTool(
  session: Awaited<ReturnType<typeof createExaSession>>,
  cacheDir: string,
  app: string,
  slug: string,
  args: Record<string, unknown>,
  listedUsd: number,
  budget: ExaBudget,
): Promise<Record<string, unknown>> {
  const filePath = cacheFile(cacheDir, slug, args);
  try {
    const stored: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    const record = asRecord(stored);
    const data = record ? asRecord(record.data) : null;
    if (data) {
      budget.add({
        at: new Date().toISOString(),
        app,
        slug,
        cached: true,
        listedUsd: 0,
        discountPercent: INSTANT_DISCOUNT_PERCENT,
        instantCharge: record?.instantCharge ?? null,
        costDollars: costDollars(data),
      });
      return data;
    }
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) throw error;
  }
  const result = await executeInstantTool(session, slug, args);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify({ data: result.data, instantCharge: result.instantCharge }));
  budget.add({
    at: new Date().toISOString(),
    app,
    slug,
    cached: false,
    listedUsd,
    discountPercent: INSTANT_DISCOUNT_PERCENT,
    instantCharge: result.instantCharge,
    costDollars: costDollars(result.data),
  });
  return result.data;
}

export async function readThinApp(
  cacheDir: string,
  app: { name: string; hint: string },
  budget: ExaBudget,
  session: Awaited<ReturnType<typeof createExaSession>>,
): Promise<FetchedPage[]> {
  if (!budget.canStartApp()) return [];
  budget.markApp();
  const search = await callTool(
    session,
    cacheDir,
    app.name,
    EXA_SEARCH_SLUG,
    {
      query: `${app.name} ${app.hint} official API documentation authentication`,
      numResults: RESULT_LIMIT,
      type: "fast",
    },
    LISTED_SEARCH_USD,
    budget,
  );
  const urls = resultRows(search).flatMap((row) => {
    const url = urlOf(row);
    return url ? [url] : [];
  }).slice(0, RESULT_LIMIT);
  if (urls.length === 0) return [];
  const contents = await callTool(
    session,
    cacheDir,
    app.name,
    EXA_CONTENTS_SLUG,
    {
      urls,
      text: { maxCharacters: CONTENT_CHAR_CAP, verbosity: "standard" },
    },
    LISTED_CONTENTS_USD_PER_PAGE * urls.length,
    budget,
  );
  const failed = new Set<string>();
  const statuses = payload(contents).statuses;
  if (Array.isArray(statuses)) {
    for (const status of statuses) {
      const record = asRecord(status);
      const id = record && typeof record.id === "string" ? record.id : "";
      if (record?.error && id) failed.add(id);
    }
  }
  const retrievedAt = new Date().toISOString();
  return resultRows(contents).flatMap((row) => {
    const url = urlOf(row);
    const text = textOf(row);
    if (!url || failed.has(url) || text.length === 0) return [];
    const hintUrl = absoluteHttpUrl(app.hint)?.toString() ?? "";
    const page: FetchedPage = {
      url,
      httpStatus: 200,
      text,
      html: "",
      retrievedAt,
      source: sameRegistrableSite(url, hintUrl) ? "vendor" : "non_vendor",
    };
    return [page];
  });
}
