import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../catalog/loadCatalog.js";
import { matchToolkit } from "../catalog/match.js";
import type { FetchedPage } from "../evidence/fetchPage.js";
import { createExaSession } from "../evidence/composioSearch.js";
import { ExaBudget, readThinApp } from "../evidence/exaFallback.js";
import { gatherPages } from "../evidence/gather.js";
import { HTTP_ONLY_SENTENCE, type RetrievalPlan } from "../evidence/retrieval.js";
import { isUsablePage, needsBackupSearch } from "../evidence/usable.js";
import { createClient } from "../llm/createClient.js";
import { loadOrComplete } from "../llm/diskCache.js";
import {
  ASSUMED_OUTPUT_TOKENS,
  estimateTokens,
  LISTED_INPUT_USD_PER_MILLION,
  LISTED_OUTPUT_USD_PER_MILLION,
  pageExcerpt,
  SMOKE_PROMPT_VERSION,
  smokeSystemPrompt,
  smokeUserPrompt,
} from "../research/smokePrompt.js";
import { unknownRecord } from "../research/unknownRecord.js";
import { appIdentitySchema, appRecordSchema, type AppIdentity, type AppRecord } from "../schema/appRecord.js";
import { verifyRecord } from "../verify/verifyRecord.js";
import { loadEnvFile } from "./loadEnvFile.js";

const pass2 = process.argv.includes("--pass2");
const PASS_ID = pass2 ? "pass2" : "pass1";
// The owner approved about $0.15. A fresh estimate above this stops before any paid call.
const MAX_LISTED_USD = 0.25;

interface PassRow {
  id: number;
  name: string;
  category: string;
  record: AppRecord;
  retrieval: RetrievalPlan;
  usage: { inputTokens: number; outputTokens: number };
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The pipeline failed.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

function evidenceHash(pages: readonly FetchedPage[]): string {
  const body = pages.map((page) => `${page.url}\n${page.httpStatus}\n${pageExcerpt(page.text)}`).join("\n");
  return createHash("sha256").update(SMOKE_PROMPT_VERSION).update(PASS_ID).update(body).digest("hex");
}

function httpOnly(): RetrievalPlan {
  return { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvFile(path.join(root, ".env"));
if (process.env.COST_OK !== "yes") {
  throw new Error("Set COST_OK=yes after reading the printed estimate. This command calls the model for every app.");
}

const checkedAt = new Date().toISOString();
const apps = appIdentitySchema.array().parse(
  JSON.parse(readFileSync(path.join(root, "data/apps.json"), "utf8")),
);
const fetchCache = path.join(root, "data/cache/fetch");
const llmCache = path.join(root, "data/cache/llm");
const outDir = path.join(root, pass2 ? "data/runs/pass2" : "data/runs/pass1");
if (!pass2 && existsSync(path.join(outDir, "records.json"))) {
  throw new Error("Pass 1 is frozen at data/runs/pass1/records.json. Run npm run pass2 for the next pass.");
}
const catalog = await loadCatalog(process.env, path.join(root, "data/cache/catalog"));
const system = smokeSystemPrompt();
const gathered = new Map<number, { pages: FetchedPage[]; retrieval: RetrievalPlan; error?: string }>();

for (const app of apps) {
  try {
    const result = await gatherPages(app.hint, process.env, fetchCache);
    gathered.set(app.id, result);
  } catch (error) {
    gathered.set(app.id, { pages: [], retrieval: httpOnly(), error: safeMessage(error) });
  }
}

if (pass2) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("Set COMPOSIO_API_KEY.");
  const session = await createExaSession(apiKey);
  const budget = new ExaBudget(Number(process.env.EXA_MAX_APPS ?? "20"));
  const exaCache = path.join(root, "data/cache/exa");
  for (const app of apps) {
    const item = gathered.get(app.id);
    if (!item || !needsBackupSearch(item.pages) || !budget.canStartApp()) continue;
    try {
      const extra = await readThinApp(exaCache, app, budget, session);
      if (extra.length > 0) {
        item.pages = [...item.pages, ...extra];
        item.retrieval = {
          mode: "composio_search",
          sentence: "Composio search used EXA_SEARCH, then EXA_GET_CONTENTS_ACTION.",
          searchSlug: "EXA_SEARCH",
        };
      }
    } catch (error) {
      console.log(`${app.name}: Exa fallback failed. ${safeMessage(error)}`);
    }
  }
}

const prompts = apps.map((app) => smokeUserPrompt(app, gathered.get(app.id)?.pages ?? []));
const inputTokens = estimateTokens(apps.map(() => system).join("\n") + prompts.join("\n"));
const outputTokens = apps.length * ASSUMED_OUTPUT_TOKENS;
const listedUsd = (inputTokens / 1_000_000) * LISTED_INPUT_USD_PER_MILLION
  + (outputTokens / 1_000_000) * LISTED_OUTPUT_USD_PER_MILLION;
const estimate = [
  "Estimate before the paid pass1 calls.",
  `Apps: ${apps.length}.`,
  `Input tokens, counted as characters divided by 4: ${inputTokens}.`,
  `Assumed output tokens: ${outputTokens} (${ASSUMED_OUTPUT_TOKENS} per app).`,
  `Listed OpenRouter price for google/gemini-2.5-flash-lite: $${LISTED_INPUT_USD_PER_MILLION} per million input tokens and $${LISTED_OUTPUT_USD_PER_MILLION} per million output tokens.`,
  `Estimated listed charge: $${listedUsd.toFixed(4)}. This is not a measured cost.`,
  "Composio search is not called. The catalog is the saved copy.",
].join("\n");
console.log(estimate);
if (listedUsd > MAX_LISTED_USD) {
  throw new Error(`Estimated listed charge $${listedUsd.toFixed(4)} is above $${MAX_LISTED_USD}. No model call was made.`);
}

const client = createClient();
const savedPath = path.join(outDir, "records.json");
const rows: PassRow[] = pass2 && existsSync(savedPath)
  ? (JSON.parse(readFileSync(savedPath, "utf8")) as { apps: PassRow[] }).apps
  : [];
const done = new Set(rows.map((row) => row.id));
const lines = [estimate, `Catalog: ${catalog.note}`];

function writeRows(partial: readonly PassRow[]): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "records.json"),
    JSON.stringify({ catalog: catalog.note, apps: partial }, null, 2),
  );
}

for (const app of apps) {
  if (done.has(app.id)) continue;
  const item = gathered.get(app.id);
  if (!item) {
    throw new Error(`Missing gathered pages for ${app.name}.`);
  }
  if (!item.pages.some(isUsablePage)) {
    const reason = item.error ?? "No fetched page had enough text to quote.";
    rows.push({
      id: app.id,
      name: app.name,
      category: app.category,
      record: unknownRecord(reason, checkedAt, SMOKE_PROMPT_VERSION, PASS_ID),
      retrieval: item.retrieval,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    lines.push(`${app.name}: no usable page. ${reason}`);
    writeRows(rows);
    continue;
  }
  const user = smokeUserPrompt(app, item.pages);
  let result;
  try {
    result = await loadOrComplete(
      client,
      {
        system,
        user,
        promptVersion: SMOKE_PROMPT_VERSION,
        passId: PASS_ID,
        evidenceHash: evidenceHash(item.pages),
      },
      appRecordSchema,
      llmCache,
    );
  } catch (error) {
    const first = safeMessage(error);
    if (!first.includes("429")) {
      rows.push(failedRow(app, item.retrieval, first));
      lines.push(`${app.name}: model call failed. ${first}`);
      writeRows(rows);
      continue;
    }
    await sleep(20_000);
    try {
      result = await loadOrComplete(
        client,
        {
          system,
          user,
          promptVersion: SMOKE_PROMPT_VERSION,
          passId: PASS_ID,
          evidenceHash: evidenceHash(item.pages),
        },
        appRecordSchema,
        llmCache,
      );
    } catch (retryError) {
      const reason = safeMessage(retryError);
      rows.push(failedRow(app, item.retrieval, reason));
      lines.push(`${app.name}: model call failed. ${reason}`);
      writeRows(rows);
      continue;
    }
  }
  const stamped = appRecordSchema.parse({
    ...result.data,
    checkedAt,
    promptVersion: SMOKE_PROMPT_VERSION,
    passId: PASS_ID,
  });
  const record = verifyRecord(stamped, item.pages, matchToolkit(app.name, catalog.toolkits));
  rows.push({
    id: app.id,
    name: app.name,
    category: app.category,
    record,
    retrieval: item.retrieval,
    usage: result.usage,
  });
  lines.push(
    `${app.name}: auth ${record.auth.join("|")} access ${record.access} surface ${record.apiSurface} mcp ${record.mcp} buildability ${record.buildability} confidence ${record.confidence} tokens ${result.usage.inputTokens}/${result.usage.outputTokens}`,
  );
  writeRows(rows);
  await sleep(1_200);
}

function failedRow(app: AppIdentity, retrieval: RetrievalPlan, reason: string): PassRow {
  return {
    id: app.id,
    name: app.name,
    category: app.category,
    record: unknownRecord(reason, checkedAt, SMOKE_PROMPT_VERSION, PASS_ID),
    retrieval,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

const measuredIn = rows.reduce((sum, row) => sum + row.usage.inputTokens, 0);
const measuredOut = rows.reduce((sum, row) => sum + row.usage.outputTokens, 0);
lines.push(`Measured tokens: ${measuredIn} input, ${measuredOut} output. The provider response did not include a dollar cost.`);
writeFileSync(path.join(outDir, "log.txt"), `${lines.join("\n")}\n`);
console.log(lines.slice(1).join("\n"));
console.log(`Wrote ${path.join(outDir, "records.json")}`);
