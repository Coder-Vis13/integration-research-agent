import { absoluteHttpUrl, findDocUrls, isAuthDocLink, isDocsLink, isLocaleCopy } from "./docFinder.js";
import { fetchPage, type FetchedPage } from "./fetchPage.js";
import { normalizeText } from "./htmlText.js";
import { HTTP_ONLY_SENTENCE, type RetrievalPlan } from "./retrieval.js";

// A homepage can link to many doc URLs. Cap the follow so one app cannot crawl the site.
const MAX_DOC_LINKS = 8;
// A 404 does not use one of the 8 slots. This stops a long run of bad links.
const MAX_EXTRA_ATTEMPTS = 16;

export async function gatherPages(
  hint: string,
  _env: NodeJS.ProcessEnv,
  cacheDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ pages: FetchedPage[]; retrieval: RetrievalPlan }> {
  const hintUrl = absoluteHttpUrl(hint);
  if (!hintUrl) {
    return {
      pages: [],
      retrieval: { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null },
    };
  }

  const first = await fetchPage(hintUrl.toString(), cacheDir, fetchImpl);
  const pages = [first];
  const seen = new Set([first.url]);
  const seenText = new Set([normalizeText(first.text).slice(0, 2000)]);
  const queue = findDocUrls(hint, first.html).filter((url) => url !== first.url);
  let kept = 0;
  let attempts = 0;
  while (queue.length > 0 && kept < MAX_DOC_LINKS && attempts < MAX_EXTRA_ATTEMPTS) {
    const url = queue.shift();
    if (!url || seen.has(url) || isLocaleCopy(url)) {
      continue;
    }
    seen.add(url);
    attempts += 1;
    let page: FetchedPage;
    try {
      page = await fetchPage(url, cacheDir, fetchImpl);
    } catch {
      continue;
    }
    if (page.httpStatus < 200 || page.httpStatus >= 300) {
      continue;
    }
    const textKey = normalizeText(page.text).slice(0, 2000);
    if (seenText.has(textKey)) {
      continue;
    }
    seenText.add(textKey);
    pages.push(page);
    kept += 1;
    if (kept >= MAX_DOC_LINKS) {
      break;
    }
    // Follow an auth page or a docs index. Locale copies and duplicate shells do not use a slot.
    const deeper = findDocUrls(page.url, page.html).filter((next) => (
      !seen.has(next) && !queue.includes(next) && (isAuthDocLink(next) || isDocsLink(next))
    ));
    queue.unshift(...deeper.reverse());
  }

  return {
    pages,
    retrieval: { mode: "http_only", sentence: HTTP_ONLY_SENTENCE, searchSlug: null },
  };
}
