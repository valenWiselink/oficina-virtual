import { numbersToDigits, prNumbers } from './refs.js';

/** Reading an ask's words: its command, its PRs, a time of day. */

/** A command worth a copy button: the first `code` span with an argument (a lone
 *  `main` or `informe.md` is a name, not something to run). */
export function commandOf(rawLine: string | undefined): string | undefined {
  if (!rawLine) return undefined;
  for (const match of rawLine.matchAll(/`([^`\n]+)`/g)) {
    const code = match[1].trim();
    if (/\s/.test(code)) return code;
  }
  return undefined;
}

const PR_URL = /https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/pull\/\d+/g;

/**
 * «23:00» as a moment: today at that time on this machine's clock, or
 * tomorrow when today's has long passed (said at 23:30, «09:00» is the
 * morning). Null when it is not HH:MM.
 */
export function clockAt(hhmm: string, now: number): number | null {
  const m = /^\s*(\d{1,2})(?::|\.|h)?(\d{2})?\s*(?:h|hs)?\s*$/i.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const at = new Date(now);
  at.setHours(h, min, 0, 0);
  if (at.getTime() < now - 6 * 3600_000) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** «#12» for a PR URL. */
export const prLabel = (url: string): string => `#${url.split('/').pop() ?? ''}`;

/** The PR URLs an ask names: its own links, and «#12» or «PR 12» when an
 *  agent's answers linked that number before (`known`, mergedAsk.ts). */
export function prUrlsOf(text: string, known?: ReadonlyMap<number, string>): string[] {
  const plain = numbersToDigits(text);
  const urls = [...plain.matchAll(PR_URL)].map((m) => m[0]);
  for (const n of prNumbers(plain.replace(PR_URL, ' '))) {
    const url = known?.get(n);
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}
