export const CATALOG_SKIPPED_NOTE =
  "COMPOSIO_API_KEY is not set. Live catalog call was skipped.";

export interface CatalogSkip {
  mode: "skipped";
  note: string;
}

export interface CatalogReady {
  mode: "live";
}

export function catalogStatus(env: NodeJS.ProcessEnv): CatalogSkip | CatalogReady {
  if (!env.COMPOSIO_API_KEY) {
    return { mode: "skipped", note: CATALOG_SKIPPED_NOTE };
  }
  return { mode: "live" };
}
