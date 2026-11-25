import type { CatalogToolkit } from "./types.js";

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchToolkit(name: string, toolkits: readonly CatalogToolkit[]): CatalogToolkit | null {
  const key = normalizeName(name);
  if (key.length === 0) {
    return null;
  }
  return toolkits.find((toolkit) =>
    normalizeName(toolkit.name) === key || normalizeName(toolkit.slug) === key,
  ) ?? null;
}
