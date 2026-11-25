import type { ZodType } from "zod";

export interface LlmRequest {
  system: string;
  user: string;
  promptVersion: string;
  passId: string;
  evidenceHash: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
  raw: string;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  completeJson<T>(request: LlmRequest, schema: ZodType<T>): Promise<LlmResult<T>>;
}
