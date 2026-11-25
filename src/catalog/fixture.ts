import type { CatalogToolkit } from "./types.js";

// Fictional product. Not one of the 100 apps and not a smoke app.
export const CATALOG_FIXTURE: readonly CatalogToolkit[] = [
  {
    slug: "exampleapp",
    name: "ExampleApp",
    authSchemes: ["OAUTH2"],
    composioManagedAuthSchemes: ["OAUTH2"],
    noAuth: false,
    toolsCount: 3,
    triggersCount: 0,
  },
];
