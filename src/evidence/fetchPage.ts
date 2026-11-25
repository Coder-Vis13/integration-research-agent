import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { htmlToText } from "./htmlText.js";

export interface FetchedPage {
  url: string;
  httpStatus: number;
  text: string;
  html: string;
  retrievedAt: string;
  source?: "vendor" | "non_vendor";
}

function assertNotRunsPath(filePath: string): void {
  if (path.normalize(filePath).split(path.sep).includes("runs")) {
    throw new Error("Refusing to write under data/runs until ground truth is committed.");
  }
}

function cachePath(cacheDir: string, url: string): string {
  const name = createHash("sha256").update(url).digest("hex") + ".json";
  return path.join(cacheDir, name);
}

function isStoredPage(value: unknown, url: string): value is FetchedPage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const page = value as FetchedPage;
  return page.url === url
    && typeof page.httpStatus === "number"
    && typeof page.text === "string"
    && typeof page.html === "string"
    && typeof page.retrievedAt === "string";
}

export async function fetchPage(
  url: string,
  cacheDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedPage> {
  const filePath = cachePath(cacheDir, url);
  assertNotRunsPath(filePath);

  let raw: string | undefined;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) {
      throw error;
    }
  }
  if (raw !== undefined) {
    const stored: unknown = JSON.parse(raw);
    if (!isStoredPage(stored, url)) {
      throw new Error(`Fetch cache does not match ${url}`);
    }
    return stored;
  }

  const response = await fetchImpl(url);
  const html = await response.text();
  const page: FetchedPage = {
    url,
    httpStatus: response.status,
    text: htmlToText(html),
    html,
    retrievedAt: new Date().toISOString(),
  };
  mkdirSync(cacheDir, { recursive: true });
  assertNotRunsPath(filePath);
  writeFileSync(filePath, JSON.stringify(page));
  return page;
}
