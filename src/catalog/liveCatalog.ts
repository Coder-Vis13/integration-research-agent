import type { ToolkitListResponse } from "@composio/client/resources/toolkits";
import { Composio } from "@composio/core";
import type { CatalogToolkit } from "./types.js";

// composio.toolkits.get drops next_cursor. The generated client list keeps it.
const PAGE_LIMIT = 100;
const MAX_PAGES = 40;

function toToolkit(item: ToolkitListResponse["items"][number]): CatalogToolkit {
  return {
    slug: item.slug,
    name: item.name,
    authSchemes: item.auth_schemes ?? [],
    composioManagedAuthSchemes: item.composio_managed_auth_schemes ?? [],
    noAuth: item.no_auth ?? false,
    toolsCount: item.meta.tools_count,
    triggersCount: item.meta.triggers_count,
  };
}

export async function loadLiveCatalog(apiKey: string): Promise<CatalogToolkit[]> {
  const client = new Composio({ apiKey }).getClient();
  const toolkits: CatalogToolkit[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.toolkits.list({
      limit: PAGE_LIMIT,
      sort_by: "alphabetically",
      ...(cursor ? { cursor } : {}),
    });
    toolkits.push(...response.items.map(toToolkit));
    const next = response.next_cursor;
    if (!next) return toolkits;
    if (seen.has(next)) {
      throw new Error("Composio toolkit list repeated a cursor. Refusing to continue.");
    }
    seen.add(next);
    cursor = next;
  }

  throw new Error(
    "Composio toolkit list still had a cursor after 40 pages. Refusing to treat the catalog as complete.",
  );
}
