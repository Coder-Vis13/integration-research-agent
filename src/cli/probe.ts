import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../catalog/loadCatalog.js";
import { matchToolkit } from "../catalog/match.js";
import { createExaSession } from "../evidence/composioSearch.js";
import {
  ExaBudget,
  INSTANT_DISCOUNT_PERCENT,
  LISTED_CONTENTS_USD_PER_PAGE,
  LISTED_SEARCH_USD,
  readThinApp,
} from "../evidence/exaFallback.js";
import type { FetchedPage } from "../evidence/fetchPage.js";
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
import { appIdentitySchema, appRecordSchema, type AppRecord } from "../schema/appRecord.js";
import { verifyRecord } from "../verify/verifyRecord.js";
import { loadEnvFile } from "./loadEnvFile.js";

const PASS_ID = "probe";
const MAX_LISTED_LLM_USD = Number(process.env.DEV_SPEND_LIMIT ?? "0.15");

function namesFromArgv(argv: readonly string[]): string[] {
  const names: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--app") {
      const name = argv[index + 1];
      if (!name || name.startsWith("--")) throw new Error("Usage: npm run probe -- --app <name> [--out <file>]");
      names.push(name);
    }
  }
  if (names.length === 0) throw new Error("Usage: npm run probe -- --app <name> [--out <file>]");
  return names;
}

function outPath(root: string, argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  const given = index >= 0 ? argv[index + 1] : undefined;
  const filePath = given && !given.startsWith("--")
    ? path.resolve(root, given)
    : path.join(root, "data/smoke/exa-probe.json");
  if (path.normalize(filePath).split(path.sep).includes("runs")) {
    throw new Error("Refusing to write a probe under data/runs.");
  }
  return filePath;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The pipeline failed.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").replace(/ak_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function evidenceHash(pages: readonly FetchedPage[]): string {
  const body = pages.map((page) => `${page.url}\n${page.httpStatus}\n${pageExcerpt(page.text)}`).join("\n");
  return createHash("sha256").update(SMOKE_PROMPT_VERSION).update(PASS_ID).update(body).digest("hex");
}

function httpOnly(): RetrievalPlan {
  return { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvFile(path.join(root, ".env"));
const requested = namesFromArgv(process.argv);
const destination = outPath(root, process.argv);
const maxApps = Number(process.env.EXA_MAX_APPS ?? "3");
if (!Number.isInteger(maxApps) || maxApps < 1) throw new Error("EXA_MAX_APPS must be a positive integer.");
if (process.env.COMPOSIO_SEARCH_TOOL_SLUG !== "EXA_SEARCH") {
  throw new Error("Set COMPOSIO_SEARCH_TOOL_SLUG=EXA_SEARCH.");
}
const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) throw new Error("Set COMPOSIO_API_KEY.");

const apps = appIdentitySchema.array().parse(JSON.parse(readFileSync(path.join(root, "data/apps.json"), "utf8")));
const chosen = requested.map((name) => {
  const found = apps.filter((app) => app.name === name);
  if (found.length !== 1 || !found[0]) throw new Error(`Expected one app named ${name}.`);
  return found[0];
});
const fetchCache = path.join(root, "data/cache/fetch");
const exaCache = path.join(root, "data/cache/exa");
const llmCache = path.join(root, "data/cache/llm");
const catalog = await loadCatalog(process.env, path.join(root, "data/cache/catalog"));
const budget = new ExaBudget(maxApps);
const listedExa = maxApps * LISTED_SEARCH_USD + maxApps * 3 * LISTED_CONTENTS_USD_PER_PAGE;
console.log([
  "Exa Instant estimate before any Exa call.",
  `Thin-app budget: ${maxApps}.`,
  `Listed price: $${LISTED_SEARCH_USD} per search and $${LISTED_CONTENTS_USD_PER_PAGE} per page.`,
  `Instant discount: ${INSTANT_DISCOUNT_PERCENT} percent. Listed charge after that discount, if every budget slot is used: $0.`,
  `Listed charge before the discount, if every slot is used: $${listedExa.toFixed(4)}. This is not a measured charge.`,
].join("\n"));

const session = await createExaSession(apiKey);
const checkedAt = new Date().toISOString();
const gathered = new Map<number, { pages: FetchedPage[]; retrieval: RetrievalPlan; error?: string }>();

for (const app of chosen) {
  let pages: FetchedPage[] = [];
  let retrieval = httpOnly();
  try {
    const http = await gatherPages(app.hint, process.env, fetchCache);
    pages = http.pages;
    retrieval = http.retrieval;
  } catch (error) {
    gathered.set(app.id, { pages: [], retrieval, error: safeMessage(error) });
    continue;
  }
  if (needsBackupSearch(pages)) {
    if (!budget.canStartApp()) {
      console.log(`${app.name}: still thin. Exa budget is used up.`);
    } else {
      try {
        const extra = await readThinApp(exaCache, app, budget, session);
        pages = [...pages, ...extra];
        if (extra.length > 0) {
          retrieval = {
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
  gathered.set(app.id, { pages, retrieval });
}

const system = smokeSystemPrompt();
const prompts = chosen.map((app) => smokeUserPrompt(app, gathered.get(app.id)?.pages ?? []));
const inputTokens = estimateTokens(chosen.map(() => system).join("\n") + prompts.join("\n"));
const outputTokens = chosen.length * ASSUMED_OUTPUT_TOKENS;
const listedLlm = (inputTokens / 1_000_000) * LISTED_INPUT_USD_PER_MILLION
  + (outputTokens / 1_000_000) * LISTED_OUTPUT_USD_PER_MILLION;
console.log([
  "LLM estimate before the probe model calls.",
  `Apps: ${chosen.length}.`,
  `Input tokens, counted as characters divided by 4: ${inputTokens}.`,
  `Assumed output tokens: ${outputTokens}.`,
  `Estimated listed charge: $${listedLlm.toFixed(4)}. This is not a measured cost.`,
].join("\n"));
if (listedLlm > MAX_LISTED_LLM_USD) {
  throw new Error(`Estimated listed charge $${listedLlm.toFixed(4)} is above $${MAX_LISTED_LLM_USD}. No model call was made.`);
}

const client = createClient();
const rows: { id: number; name: string; record: AppRecord; retrieval: RetrievalPlan; usage: { inputTokens: number; outputTokens: number } }[] = [];
for (const app of chosen) {
  const item = gathered.get(app.id);
  if (!item) throw new Error(`Missing pages for ${app.name}.`);
  if (!item.pages.some(isUsablePage)) {
    const reason = item.error ?? "No fetched page had enough text to quote.";
    rows.push({
      id: app.id,
      name: app.name,
      record: unknownRecord(reason, checkedAt, SMOKE_PROMPT_VERSION, PASS_ID),
      retrieval: item.retrieval,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    console.log(`${app.name}: no usable page. ${reason}`);
    continue;
  }
  const request = {
    system,
    user: smokeUserPrompt(app, item.pages),
    promptVersion: SMOKE_PROMPT_VERSION,
    passId: PASS_ID,
    evidenceHash: evidenceHash(item.pages),
  };
  try {
    let result;
    try {
      result = await loadOrComplete(client, request, appRecordSchema, llmCache);
    } catch (error) {
      if (!safeMessage(error).includes("429")) throw error;
      await sleep(20_000);
      result = await loadOrComplete(client, request, appRecordSchema, llmCache);
    }
    const stamped = appRecordSchema.parse({
      ...result.data,
      checkedAt,
      promptVersion: SMOKE_PROMPT_VERSION,
      passId: PASS_ID,
    });
    const record = verifyRecord(stamped, item.pages, matchToolkit(app.name, catalog.toolkits));
    rows.push({ id: app.id, name: app.name, record, retrieval: item.retrieval, usage: result.usage });
    console.log(`${app.name}: auth ${record.auth.join("|")} access ${record.access} surface ${record.apiSurface} buildability ${record.buildability} confidence ${record.confidence} retrieval ${item.retrieval.mode}`);
  } catch (error) {
    const reason = safeMessage(error);
    rows.push({
      id: app.id,
      name: app.name,
      record: unknownRecord(reason, checkedAt, SMOKE_PROMPT_VERSION, PASS_ID),
      retrieval: item.retrieval,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    console.log(`${app.name}: model call failed. ${reason}`);
  }
}

mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify({ catalog: catalog.note, exa: budget.usage, apps: rows }, null, 2));
const usagePath = path.join(root, "data/smoke/exa-usage.json");
let prior: unknown[] = [];
try {
  const parsed: unknown = JSON.parse(readFileSync(usagePath, "utf8"));
  if (Array.isArray(parsed)) prior = parsed;
} catch (error) {
  const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
  if (!missing) throw error;
}
writeFileSync(usagePath, JSON.stringify([...prior, ...budget.usage], null, 2));
const measuredIn = rows.reduce((sum, row) => sum + row.usage.inputTokens, 0);
const measuredOut = rows.reduce((sum, row) => sum + row.usage.outputTokens, 0);
console.log(`Measured LLM tokens: ${measuredIn} input, ${measuredOut} output. The provider response did not include a dollar cost.`);
console.log(`Exa calls logged: ${budget.usage.length}. Wrote ${destination}`);
