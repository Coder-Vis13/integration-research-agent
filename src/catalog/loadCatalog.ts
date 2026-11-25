import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATALOG_FIXTURE } from "./fixture.js";
import { loadLiveCatalog } from "./liveCatalog.js";
import { CATALOG_SKIPPED_NOTE } from "./status.js";
import type { CatalogToolkit } from "./types.js";

export interface CatalogLoad {
  source: "fixture" | "live";
  note: string;
  toolkits: readonly CatalogToolkit[];
}

function assertNotRunsPath(filePath: string): void {
  if (path.normalize(filePath).split(path.sep).includes("runs")) {
    throw new Error("Refusing to write under data/runs until ground truth is committed.");
  }
}

function isToolkit(value: unknown): value is CatalogToolkit {
  if (!value || typeof value !== "object") {
    return false;
  }
  const toolkit = value as CatalogToolkit;
  return typeof toolkit.slug === "string"
    && typeof toolkit.name === "string"
    && Array.isArray(toolkit.authSchemes)
    && Array.isArray(toolkit.composioManagedAuthSchemes)
    && typeof toolkit.noAuth === "boolean"
    && typeof toolkit.toolsCount === "number"
    && typeof toolkit.triggersCount === "number";
}

function readCached(filePath: string): CatalogToolkit[] | undefined {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) {
      throw error;
    }
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isToolkit)) {
    throw new Error(`Catalog cache is not a toolkit list: ${filePath}`);
  }
  return parsed;
}

export async function loadCatalog(env: NodeJS.ProcessEnv, cacheDir: string): Promise<CatalogLoad> {
  if (!env.COMPOSIO_API_KEY) {
    return {
      source: "fixture",
      note: CATALOG_SKIPPED_NOTE,
      toolkits: CATALOG_FIXTURE,
    };
  }

  const filePath = path.join(cacheDir, "toolkits.json");
  assertNotRunsPath(filePath);
  const cached = readCached(filePath);
  if (cached) {
    return {
      source: "live",
      note: "Live catalog loaded from cache.",
      toolkits: cached,
    };
  }

  const toolkits = await loadLiveCatalog(env.COMPOSIO_API_KEY);
  mkdirSync(cacheDir, { recursive: true });
  assertNotRunsPath(filePath);
  writeFileSync(filePath, JSON.stringify(toolkits, null, 2));
  return {
    source: "live",
    note: "Live catalog loaded from Composio.",
    toolkits,
  };
}
