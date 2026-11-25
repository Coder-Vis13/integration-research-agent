import OpenAI from "openai";
import type { ClientOptions } from "openai";
import { toJSONSchema, type ZodType } from "zod/v4";
import type { LlmClient, LlmRequest, LlmResult } from "./types.js";

const SCHEMA_NAME = "research_record";
const MISSING_UNKNOWN_REASON = "The pages did not support access or API surface, and the model gave no reason.";
const MISSING_BLOCKER = "The model did not name a blocker.";

function copyRecord(value: object): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    copy[key] = Reflect.get(value, key) as unknown;
  }
  return copy;
}

function normalizeModelRecord(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const copy = copyRecord(value);
  const access = copy.access;
  const surface = copy.apiSurface;
  const reason = copy.unknownReason;
  if (typeof reason !== "string" || reason.trim() === "") {
    delete copy.unknownReason;
  }
  const needsReason = access === "unknown" || surface === "unknown";
  if (needsReason && typeof copy.unknownReason !== "string") {
    copy.unknownReason = MISSING_UNKNOWN_REASON;
  }
  const blocker = typeof copy.blocker === "string" ? copy.blocker : "";
  if (copy.buildability === "build_now" && blocker.trim() !== "") {
    copy.buildability = "unknown";
    copy.blocker = blocker;
    if (typeof copy.unknownReason !== "string" || copy.unknownReason.trim() === "") {
      copy.unknownReason = "The model said build_now and also named a blocker.";
    }
  } else if (copy.buildability !== "build_now" && blocker.trim() === "") {
    copy.blocker = MISSING_BLOCKER;
  }
  return copy;
}

function requiredEnv(env: NodeJS.ProcessEnv, key: "LLM_API_KEY" | "LLM_BASE_URL" | "LLM_MODEL"): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Set ${key}.`);
  }
  return value;
}

function jsonSchemaFor(schema: ZodType): Record<string, unknown> {
  // Strict mode rejects this record because optional fields are not nullable.
  // Draft-07 keeps those fields optional. Zod parses the reply afterward.
  const generated: unknown = JSON.parse(JSON.stringify(toJSONSchema(schema, { target: "draft-07" })));
  if (typeof generated !== "object" || generated === null || Array.isArray(generated)) {
    throw new Error("Zod did not produce a JSON schema object.");
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(generated)) {
    if (key === "$schema") continue;
    record[key] = Reflect.get(generated, key) as unknown;
  }
  return record;
}

export class OpenAiCompatibleClient implements LlmClient {
  readonly provider = "openai-compatible";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(env: NodeJS.ProcessEnv, fetchImpl?: ClientOptions["fetch"]) {
    this.model = requiredEnv(env, "LLM_MODEL");
    this.client = new OpenAI({
      apiKey: requiredEnv(env, "LLM_API_KEY"),
      baseURL: requiredEnv(env, "LLM_BASE_URL"),
      fetch: fetchImpl,
      // A failed call should surface once. Retries would repeat a billed request.
      maxRetries: 0,
    });
  }

  async completeJson<T>(request: LlmRequest, schema: ZodType<T>): Promise<LlmResult<T>> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: SCHEMA_NAME,
          strict: false,
          schema: jsonSchemaFor(schema),
        },
      },
    });
    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty completion.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new Error("OpenRouter returned text that is not JSON.");
    }
    const usage = completion.usage;
    if (!usage) {
      throw new Error("OpenRouter response did not include token usage.");
    }
    return {
      data: schema.parse(normalizeModelRecord(parsed)),
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
      raw: content,
    };
  }
}
