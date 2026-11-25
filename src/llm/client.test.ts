import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { z } from "zod";
import { loadEnvFile } from "../cli/loadEnvFile.js";
import { appRecordSchema } from "../schema/appRecord.js";
import { makeCacheKey } from "./cacheKey.js";
import { createClient } from "./createClient.js";

test("stub output parses as an unknown research record", async () => {
  const client = createClient({ LLM_PROVIDER: "stub", LLM_MODEL: "stub" });
  const result = await client.completeJson(
    {
      system: "no page text",
      user: "Example app",
      promptVersion: "phase1-stub-v1",
      passId: "stub",
      evidenceHash: "empty",
    },
    appRecordSchema,
  );
  const parsed = appRecordSchema.parse(result.data);
  assert.equal(parsed.confidence, "low");
  assert.deepEqual(parsed.auth, ["unknown"]);
  assert.equal(parsed.access, "unknown");
  assert.equal(parsed.evidence.length, 0);
  assert.equal(result.usage.inputTokens, 0);
  assert.equal(result.usage.outputTokens, 0);
});

test("unknown provider throws a clear error", () => {
  assert.throws(
    () => createClient({ LLM_PROVIDER: "not-a-real-provider" }),
    /Unknown LLM_PROVIDER "not-a-real-provider"/,
  );
});

test("openai-compatible requires a key, base URL, and model", () => {
  assert.throws(
    () => createClient({ LLM_PROVIDER: "openai-compatible", LLM_MODEL: "model", LLM_BASE_URL: "https://example.test/v1" }),
    /Set LLM_API_KEY/,
  );
  assert.throws(
    () => createClient({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "test-key", LLM_MODEL: "model" }),
    /Set LLM_BASE_URL/,
  );
  assert.throws(
    () => createClient({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "test-key", LLM_BASE_URL: "https://example.test/v1" }),
    /Set LLM_MODEL/,
  );
});

test("openai-compatible sends a JSON schema and parses the reply", async () => {
  const seen: { url: string; body: string }[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === "string"
      ? init.body
      : input instanceof Request
        ? await input.text()
        : "";
    seen.push({ url, body });
    return new Response(JSON.stringify({
      id: "test",
      object: "chat.completion",
      created: 0,
      model: "google/gemini-2.5-flash-lite",
      choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createClient(
    {
      LLM_PROVIDER: "openai-compatible",
      LLM_API_KEY: "test-key",
      LLM_MODEL: "google/gemini-2.5-flash-lite",
      LLM_BASE_URL: "https://openrouter.ai/api/v1",
    },
    { fetch: fetchImpl },
  );
  const result = await client.completeJson(
    {
      system: "Return JSON.",
      user: "ping",
      promptVersion: "test",
      passId: "test",
      evidenceHash: "none",
    },
    z.object({ ok: z.boolean() }),
  );
  assert.equal(result.data.ok, true);
  assert.equal(result.usage.inputTokens, 11);
  assert.equal(result.usage.outputTokens, 4);
  assert.equal(seen.length, 1);
  assert.match(seen[0]?.url ?? "", /\/chat\/completions$/);
  const sent = JSON.parse(seen[0]?.body ?? "{}") as {
    model?: string;
    response_format?: { type?: string; json_schema?: { strict?: boolean; name?: string } };
  };
  assert.equal(sent.model, "google/gemini-2.5-flash-lite");
  assert.equal(sent.response_format?.type, "json_schema");
  assert.equal(sent.response_format?.json_schema?.name, "research_record");
  assert.equal(sent.response_format?.json_schema?.strict, false);
});

test("an empty OpenRouter completion throws", async () => {
  const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
    id: "test",
    object: "chat.completion",
    created: 0,
    model: "google/gemini-2.5-flash-lite",
    choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const client = createClient(
    {
      LLM_PROVIDER: "openai-compatible",
      LLM_API_KEY: "test-key",
      LLM_MODEL: "google/gemini-2.5-flash-lite",
      LLM_BASE_URL: "https://openrouter.ai/api/v1",
    },
    { fetch: fetchImpl },
  );
  await assert.rejects(
    () => client.completeJson(
      { system: "Return JSON.", user: "ping", promptVersion: "test", passId: "test", evidenceHash: "none" },
      z.object({ ok: z.boolean() }),
    ),
    /empty completion/,
  );
});

test("loadEnvFile fills missing keys and does not override the shell", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "env-test-"));
  const filePath = path.join(dir, ".env");
  writeFileSync(filePath, "LLM_PROVIDER=openai-compatible\nLLM_MODEL=google/gemini-2.5-flash-lite\n");
  const env: NodeJS.ProcessEnv = { LLM_PROVIDER: "stub" };
  loadEnvFile(filePath, env);
  assert.equal(env.LLM_PROVIDER, "stub");
  assert.equal(env.LLM_MODEL, "google/gemini-2.5-flash-lite");
});

test("cache key includes provider, model, and prompt version", () => {
  const key = makeCacheKey({
    provider: "provider-x",
    model: "model-y",
    promptVersion: "prompt-z",
    passId: "pass-q",
    evidenceHash: "evidence-r",
  });
  assert.ok(key.includes("provider-x"));
  assert.ok(key.includes("model-y"));
  assert.ok(key.includes("prompt-z"));
  assert.ok(key.includes("pass-q"));
  assert.ok(key.includes("evidence-r"));
});
