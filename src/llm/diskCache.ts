import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { makeCacheKey, type CacheKeyInput } from "./cacheKey.js";
import type { LlmClient, LlmRequest, LlmResult } from "./types.js";

function assertNotRunsPath(filePath: string): void {
  const parts = path.normalize(filePath).split(path.sep);
  if (parts.includes("runs")) {
    throw new Error("Refusing to write under data/runs until ground truth is committed.");
  }
}

function cacheFile(dir: string, key: string): string {
  const name = createHash("sha256").update(key).digest("hex") + ".json";
  return path.join(dir, name);
}

export async function loadOrComplete<T>(
  client: LlmClient,
  request: LlmRequest,
  schema: ZodType<T>,
  cacheDir: string,
): Promise<LlmResult<T>> {
  const keyInput: CacheKeyInput = {
    provider: client.provider,
    model: client.model,
    promptVersion: request.promptVersion,
    passId: request.passId,
    evidenceHash: request.evidenceHash,
  };
  const key = makeCacheKey(keyInput);
  const filePath = cacheFile(cacheDir, key);
  assertNotRunsPath(filePath);

  let raw: string | undefined;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) {
      throw error;
    }
  }
  if (raw !== undefined) {
    const stored = JSON.parse(raw) as { cacheKey?: string; result?: LlmResult<unknown> };
    if (stored.cacheKey !== key || !stored.result) {
      throw new Error(`Cache file does not match its key: ${filePath}`);
    }
    return {
      data: schema.parse(stored.result.data),
      usage: stored.result.usage,
      raw: stored.result.raw,
    };
  }

  const result = await client.completeJson(request, schema);
  mkdirSync(cacheDir, { recursive: true });
  assertNotRunsPath(filePath);
  writeFileSync(filePath, JSON.stringify({ cacheKey: key, result }, null, 2));
  return result;
}
