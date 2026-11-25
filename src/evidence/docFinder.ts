// The plan says the path contains these words. Auth pages from the smoke also use auth and oauth.
const DOC_HINT = /docs|developer|api|auth|oauth/i;
const LOGIN_PATH = /\/(login|signin|sign-in|signup|sign-up|register)(\/|$)/i;

export function absoluteHttpUrl(hint: string): URL | null {
  // Hints often carry a note in parentheses. The note is not part of the URL.
  const trimmed = hint.replace(/\s*\([^)]*\)/g, " ").trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function registrableSite(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const labels = host.split(".").filter((label) => label.length > 0);
  if (labels.length <= 2) {
    return host;
  }
  // Last two labels, so developers.example.com and example.com count as one site.
  return labels.slice(-2).join(".");
}

function isAsset(url: URL): boolean {
  const value = `${url.pathname}${url.search}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|ico|css|js|xml|txt|md)(?:$|[?#&])/.test(value)
    || value.includes("/~gitbook/")
    || value.includes("/image?");
}

function hasDocContext(path: string): boolean {
  return /docs|documentation|developer|\/api|api-/.test(path);
}

const LOCALE_PATH = /^\/(zh|tr|ru|ro|pt|pt-br|de|fr|es|it|ja|ko|nl|pl|sv|da|fi|cs|hu|el|th|vi|uk|ar|he|bg)(\/|$)/i;

export function isLocaleCopy(url: string): boolean {
  try {
    return LOCALE_PATH.test(new URL(url).pathname.toLowerCase());
  } catch {
    return false;
  }
}

export function isDocsLink(url: string): boolean {
  return /\/docs(\/|$)|\/documentation(\/|$)/i.test(url);
}

export function sameRegistrableSite(left: string, right: string): boolean {
  try {
    return registrableSite(new URL(left).hostname) === registrableSite(new URL(right).hostname);
  } catch {
    return false;
  }
}

// A product page about "user authentication" is not an API auth doc.
export function isAuthDocLink(url: string): boolean {
  const value = url.toLowerCase();
  if (/oauth|api-key|api_key|\/api/.test(value)) {
    return true;
  }
  return hasDocContext(value) && /authentication|\/auth/.test(value);
}

function linkRank(url: URL): number {
  const path = url.pathname.toLowerCase();
  const host = url.hostname.toLowerCase();
  let rank = 0;
  if (/oauth|api-key|api_key/.test(path) || (hasDocContext(path) && /authentication/.test(path))) {
    rank += 5;
  }
  if (hasDocContext(path) && /auth/.test(path)) {
    rank += 4;
  }
  if (/api/.test(path)) {
    rank += 3;
  }
  if (/developer|docs/.test(path)) {
    rank += 2;
  }
  if (/\/docs(\/|$)/.test(path)) {
    rank += 2;
  }
  if (/developer|docs|api|auth/.test(host)) {
    rank += 1;
  }
  return rank;
}

// Same-site links whose host or path looks like documentation. The model does not choose these.
export function findDocUrls(hint: string, html: string): string[] {
  const base = absoluteHttpUrl(hint);
  if (!base) {
    return [];
  }
  const extras: { url: string; rank: number; order: number }[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:")) {
      continue;
    }
    let next: URL;
    try {
      next = new URL(raw, base);
    } catch {
      continue;
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      continue;
    }
    if (registrableSite(next.hostname) !== registrableSite(base.hostname)) {
      continue;
    }
    if (LOGIN_PATH.test(next.pathname) || isAsset(next) || isLocaleCopy(next.toString())) {
      continue;
    }
    if (!DOC_HINT.test(next.pathname) && !DOC_HINT.test(next.hostname)) {
      continue;
    }
    next.hash = "";
    const url = next.toString();
    if (url === base.toString() || extras.some((item) => item.url === url)) {
      continue;
    }
    extras.push({ url, rank: linkRank(next), order: extras.length });
  }
  extras.sort((left, right) => right.rank - left.rank || left.order - right.order);
  return [base.toString(), ...extras.map((item) => item.url)];
}
