import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../catalog/loadCatalog.js";
import { matchToolkit } from "../catalog/match.js";
import { gatherPages } from "../evidence/gather.js";
import type { FetchedPage } from "../evidence/fetchPage.js";
import { HTTP_ONLY_SENTENCE, type RetrievalPlan } from "../evidence/retrieval.js";
import { loadOrComplete } from "../llm/diskCache.js";
import { createClient } from "../llm/createClient.js";
import {
  ASSUMED_OUTPUT_TOKENS,
  estimateTokens,
  LISTED_INPUT_USD_PER_MILLION,
  LISTED_OUTPUT_USD_PER_MILLION,
  SMOKE_PASS_ID,
  pageExcerpt,
  SMOKE_PROMPT_VERSION,
  smokeSystemPrompt,
  smokeUserPrompt,
} from "../research/smokePrompt.js";
import { unknownRecord } from "../research/unknownRecord.js";
import { appIdentitySchema, appRecordSchema, type AppIdentity, type AppRecord } from "../schema/appRecord.js";
import { verifyRecord } from "../verify/verifyRecord.js";
import { loadEnvFile } from "./loadEnvFile.js";

const SMOKE_NAMES = ["Pipedrive", "Discord", "Telegram", "Pumble", "Ecwid"] as const;

interface SmokeRow {
  id: number;
  name: string;
  category: string;
  record: AppRecord;
  retrieval: RetrievalPlan;
  usage: { inputTokens: number; outputTokens: number };
}

function assertSmokePath(filePath: string): void {
  if (path.normalize(filePath).split(path.sep).includes("runs")) {
    throw new Error("Refusing to write under data/runs until ground truth is committed.");
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The pipeline failed.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

function findSmokeApps(apps: readonly AppIdentity[], sampleNames: readonly string[]): AppIdentity[] {
  return SMOKE_NAMES.map((name) => {
    const found = apps.filter((app) => app.name === name);
    if (found.length !== 1 || !found[0]) {
      throw new Error(`Expected one app named ${name} in data/apps.json.`);
    }
    if (sampleNames.includes(name)) {
      throw new Error(`${name} is in the sample. Smoke apps must stay outside it.`);
    }
    return found[0];
  });
}

function evidenceHash(pages: readonly FetchedPage[]): string {
  const body = pages.map((page) => `${page.url}\n${page.httpStatus}\n${pageExcerpt(page.text)}`).join("\n");
  return createHash("sha256").update(SMOKE_PROMPT_VERSION).update(body).digest("hex");
}

function httpOnly(): RetrievalPlan {
  return { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvFile(path.join(root, ".env"));
const checkedAt = new Date().toISOString();
const apps = appIdentitySchema.array().parse(
  JSON.parse(readFileSync(path.join(root, "data/apps.json"), "utf8")),
);
const sample = JSON.parse(readFileSync(path.join(root, "data/sample.json"), "utf8")) as {
  apps: { name: string }[];
};
const smokeApps = findSmokeApps(apps, sample.apps.map((app) => app.name));
const fetchCache = path.join(root, "data/cache/fetch");
const llmCache = path.join(root, "data/cache/llm");
const smokeDir = path.join(root, "data/smoke");
assertSmokePath(smokeDir);

const catalog = await loadCatalog(process.env, path.join(root, "data/cache/catalog"));
const system = smokeSystemPrompt();
const gathered = new Map<number, { pages: FetchedPage[]; retrieval: RetrievalPlan; error?: string }>();

for (const app of smokeApps) {
  try {
    const result = await gatherPages(app.hint, process.env, fetchCache);
    gathered.set(app.id, result);
  } catch (error) {
    gathered.set(app.id, { pages: [], retrieval: httpOnly(), error: safeMessage(error) });
  }
}

const stubClient = createClient({ ...process.env, LLM_PROVIDER: "stub", LLM_MODEL: "stub" });
const stubRows: SmokeRow[] = [];
for (const app of smokeApps) {
  const item = gathered.get(app.id);
  if (!item) throw new Error(`Missing gathered pages for ${app.name}.`);
  if (item.error) {
    stubRows.push({
      id: app.id,
      name: app.name,
      category: app.category,
      record: unknownRecord(item.error, checkedAt, SMOKE_PROMPT_VERSION, SMOKE_PASS_ID),
      retrieval: item.retrieval,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    continue;
  }
    const user = smokeUserPrompt(app, item.pages);
    const result = await loadOrComplete(
      stubClient,
      {
        system,
        user,
        promptVersion: SMOKE_PROMPT_VERSION,
        passId: SMOKE_PASS_ID,
        evidenceHash: evidenceHash(item.pages),
      },
    appRecordSchema,
    llmCache,
  );
  stubRows.push({
    id: app.id,
    name: app.name,
    category: app.category,
    record: verifyRecord(result.data, item.pages, matchToolkit(app.name, catalog.toolkits)),
    retrieval: item.retrieval,
    usage: result.usage,
  });
}

mkdirSync(smokeDir, { recursive: true });
const stubPath = path.join(smokeDir, "stub-records.json");
assertSmokePath(stubPath);
writeFileSync(stubPath, JSON.stringify({ catalog: catalog.note, apps: stubRows }, null, 2));

const prompts = smokeApps.map((app) => {
  const item = gathered.get(app.id);
  return smokeUserPrompt(app, item?.pages ?? []);
});
const inputTokens = estimateTokens(smokeApps.map(() => system).join("\n") + prompts.join("\n"));
const outputTokens = smokeApps.length * ASSUMED_OUTPUT_TOKENS;
const listedUsd = (inputTokens / 1_000_000) * LISTED_INPUT_USD_PER_MILLION
  + (outputTokens / 1_000_000) * LISTED_OUTPUT_USD_PER_MILLION;
const estimate = [
  "Estimate before the paid smoke calls.",
  `Input tokens, counted as characters divided by 4: ${inputTokens}.`,
  `Assumed output tokens: ${outputTokens} (${ASSUMED_OUTPUT_TOKENS} per app).`,
  `Listed OpenRouter price for google/gemini-2.5-flash-lite: $${LISTED_INPUT_USD_PER_MILLION} per million input tokens and $${LISTED_OUTPUT_USD_PER_MILLION} per million output tokens.`,
  `Estimated listed charge: $${listedUsd.toFixed(4)}. This is not a measured cost.`,
].join("\n");
console.log(estimate);

const lines = [estimate, `Catalog: ${catalog.note}`];
const rows: SmokeRow[] = [];

if ((process.env.LLM_PROVIDER ?? "stub") === "stub") {
  lines.push("LLM_PROVIDER=stub, so the paid smoke calls were not made. Stub records are in data/smoke/stub-records.json.");
  writeFileSync(path.join(smokeDir, "records.json"), JSON.stringify({ catalog: catalog.note, apps: stubRows }, null, 2));
} else {
  const client = createClient();
  for (const app of smokeApps) {
    const item = gathered.get(app.id);
    if (!item) throw new Error(`Missing gathered pages for ${app.name}.`);
    if (item.error) {
      rows.push({
        id: app.id,
        name: app.name,
        category: app.category,
        record: unknownRecord(item.error, checkedAt, SMOKE_PROMPT_VERSION, SMOKE_PASS_ID),
        retrieval: item.retrieval,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      lines.push(`${app.name}: fetch failed. ${item.error}`);
      continue;
    }
    const user = smokeUserPrompt(app, item.pages);
    try {
      const result = await loadOrComplete(
        client,
        {
          system,
          user,
          promptVersion: SMOKE_PROMPT_VERSION,
          passId: SMOKE_PASS_ID,
          evidenceHash: evidenceHash(item.pages),
        },
        appRecordSchema,
        llmCache,
      );
      const stamped = appRecordSchema.parse({
        ...result.data,
        checkedAt,
        promptVersion: SMOKE_PROMPT_VERSION,
        passId: SMOKE_PASS_ID,
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
    } catch (error) {
      const reason = safeMessage(error);
      rows.push({
        id: app.id,
        name: app.name,
        category: app.category,
        record: unknownRecord(reason, checkedAt, SMOKE_PROMPT_VERSION, SMOKE_PASS_ID),
        retrieval: item.retrieval,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      lines.push(`${app.name}: model call failed. ${reason}`);
    }
  }
  const measuredIn = rows.reduce((sum, row) => sum + row.usage.inputTokens, 0);
  const measuredOut = rows.reduce((sum, row) => sum + row.usage.outputTokens, 0);
  lines.push(`Measured tokens: ${measuredIn} input, ${measuredOut} output. The provider response did not include a dollar cost.`);
  const failed = rows.filter((row) => row.record.blocker === "The pipeline could not produce a record.");
  if (failed.length > 0) {
    lines.push("Paid smoke did not replace data/smoke/records.json.");
    const logPath = path.join(smokeDir, "log.txt");
    assertSmokePath(logPath);
    writeFileSync(logPath, `${lines.join("\n")}\n`);
    throw new Error(
      `Smoke model calls failed for ${failed.map((row) => row.name).join(", ")}. data/smoke/records.json was left unchanged.`,
    );
  }
  const recordsPath = path.join(smokeDir, "records.json");
  assertSmokePath(recordsPath);
  writeFileSync(recordsPath, JSON.stringify({ catalog: catalog.note, apps: rows }, null, 2));
}

const logPath = path.join(smokeDir, "log.txt");
assertSmokePath(logPath);
writeFileSync(logPath, `${lines.join("\n")}\n`);
console.log(lines.slice(1).join("\n"));
console.log(`Wrote ${path.join(smokeDir, "records.json")}`);
