import { Composio } from "@composio/core";

export const EXA_SEARCH_SLUG = "EXA_SEARCH";
export const EXA_CONTENTS_SLUG = "EXA_GET_CONTENTS_ACTION";
export interface ToolCallResult {
  data: Record<string, unknown>;
  instantCharge: unknown;
}

// Session tool call on the Composio Instant account. No separate Exa key.
export async function createExaSession(apiKey: string) {
  const composio = new Composio({ apiKey });
  return composio.sessions.create("app-research", {
    toolkits: ["exa"],
    instant: {
      toolkits: { enable: ["exa"] },
      tools: { exa: { enable: [EXA_SEARCH_SLUG, EXA_CONTENTS_SLUG] } },
      returnInstantCharge: true,
    },
  });
}

export async function executeInstantTool(
  session: Awaited<ReturnType<typeof createExaSession>>,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  // This project rejects an account argument. The session's Instant policy selects Exa.
  const result = await session.execute(toolSlug, args);
  if (result.resultType !== "completed") {
    throw new Error(result.error ?? `Composio tool ${toolSlug} ended with ${result.resultType}.`);
  }
  return { data: result.data, instantCharge: result.instantCharge ?? null };
}
