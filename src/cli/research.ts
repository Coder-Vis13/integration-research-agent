import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../catalog/loadCatalog.js";
import { matchToolkit } from "../catalog/match.js";
import { retrievalPlan } from "../evidence/retrieval.js";
import { loadOrComplete } from "../llm/diskCache.js";
import { loadEnvFile } from "./loadEnvFile.js";
import { createClient } from "../llm/createClient.js";
import { appIdentitySchema, appRecordSchema, type AppIdentity } from "../schema/appRecord.js";
import { verifyRecord } from "../verify/verifyRecord.js";

const PROMPT_VERSION = "phase1-stub-v1";

function parseAppName(argv: readonly string[]): string {
  const index = argv.indexOf("--app");
  const name = index >= 0 ? argv[index + 1] : undefined;
  if (!name || name.startsWith("--")) {
    throw new Error("Usage: npm run research -- --app <name>");
  }
  return name;
}

function findApp(apps: readonly AppIdentity[], name: string): AppIdentity {
  const exact = apps.filter((app) => app.name === name);
  if (exact.length === 1 && exact[0]) {
    return exact[0];
  }
  const folded = apps.filter((app) => app.name.toLowerCase() === name.toLowerCase());
  if (folded.length === 1 && folded[0]) {
    return folded[0];
  }
  throw new Error(`No single app named "${name}" in data/apps.json`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvFile(path.join(root, ".env"));
const name = parseAppName(process.argv);
const apps = appIdentitySchema.array().parse(
  JSON.parse(readFileSync(path.join(root, "data/apps.json"), "utf8")),
);
const app = findApp(apps, name);
const client = createClient();
const evidenceHash = createHash("sha256").update("").digest("hex");
const result = await loadOrComplete(
  client,
  {
    system: "No page text was fetched. Every research field must be unknown.",
    user: `Name: ${app.name}\nCategory: ${app.category}\nHint: ${app.hint}`,
    promptVersion: PROMPT_VERSION,
    passId: "stub",
    evidenceHash,
  },
  appRecordSchema,
  path.join(root, "data/cache/llm"),
);
const catalog = await loadCatalog(process.env, path.join(root, "data/cache/catalog"));
const record = verifyRecord(result.data, [], matchToolkit(app.name, catalog.toolkits));
const retrieval = retrievalPlan(process.env);

console.log(JSON.stringify({
  app: { id: app.id, name: app.name, category: app.category },
  record,
  catalog: { source: catalog.source, note: catalog.note },
  retrieval,
}, null, 2));
