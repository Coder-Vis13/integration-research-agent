export const HTTP_ONLY_SENTENCE =
  "Composio search was not connected, so discovery used HTTP fetches of the hint URL and same-site doc links.";

export interface RetrievalPlan {
  mode: "http_only" | "composio_search";
  sentence: string;
  searchSlug: string | null;
}

export function retrievalPlan(env: NodeJS.ProcessEnv): RetrievalPlan {
  const slug = env.COMPOSIO_SEARCH_TOOL_SLUG;
  if (!env.COMPOSIO_API_KEY || !slug) {
    return { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null };
  }
  return {
    mode: "composio_search",
    sentence: `Composio search used ${slug}.`,
    searchSlug: slug,
  };
}
