export interface CacheKeyInput {
  provider: string;
  model: string;
  promptVersion: string;
  passId: string;
  evidenceHash: string;
}

// Changing the model or the prompt must not reuse another run's answer.
export function makeCacheKey(input: CacheKeyInput): string {
  return [
    input.provider,
    input.model,
    input.promptVersion,
    input.passId,
    input.evidenceHash,
  ].join("\n");
}
