import type { ClientOptions } from "openai";
import { OpenAiCompatibleClient } from "./openaiCompatible.js";
import { StubClient } from "./stub.js";
import type { LlmClient } from "./types.js";

const RECOGNIZED = ["stub", "anthropic", "openai", "google", "openai-compatible"] as const;

export interface CreateClientOptions {
  fetch?: ClientOptions["fetch"];
}

export function createClient(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateClientOptions = {},
): LlmClient {
  const provider = env.LLM_PROVIDER;
  if (!provider) {
    throw new Error("Set LLM_PROVIDER. Use stub to run without a key.");
  }
  if (provider === "stub") {
    const model = env.LLM_MODEL && env.LLM_MODEL.length > 0 ? env.LLM_MODEL : "stub";
    return new StubClient(model);
  }
  if (provider === "openai-compatible") {
    return new OpenAiCompatibleClient(env, options.fetch);
  }
  if (provider === "anthropic" || provider === "openai" || provider === "google") {
    throw new Error(
      `LLM_PROVIDER=${provider} is recognized, and its SDK is not installed yet. Run with LLM_PROVIDER=stub.`,
    );
  }
  throw new Error(
    `Unknown LLM_PROVIDER "${provider}". Expected one of: ${RECOGNIZED.join(", ")}.`,
  );
}
