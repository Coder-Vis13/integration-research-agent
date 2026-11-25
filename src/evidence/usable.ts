// Shorter than a short paragraph. A page this thin cannot support no_public_api or a surface.
export const MIN_USABLE_CHARS = 400;

export function isUsablePage(page: { httpStatus: number; text: string }): boolean {
  return page.httpStatus >= 200 && page.httpStatus < 300 && page.text.length >= MIN_USABLE_CHARS;
}

// A long marketing page can still say nothing about how to log in.
const LOGIN_WORDING = /oauth|api[ _-]?key|personal access token|basic authentication/i;

export function needsBackupSearch(pages: readonly { httpStatus: number; text: string }[]): boolean {
  const text = pages.filter(isUsablePage).map((page) => page.text).join("\n");
  return !LOGIN_WORDING.test(text);
}
