/**
 * The PR a pending ask asks Valentín to merge, and how, for a «Mergear»
 * button (asked 2026-11-06: «merges que pueden hacerse desde el botón»).
 * Only asks that talk about merging get one. The arguments are rebuilt from a
 * short allowlist, never taken from the ask as written: a `gh pr merge 2752
 * --repo o/r --merge --match-head-commit abc123` keeps its method and its
 * head-commit guard, and nothing else (no --admin, no --auto).
 */

export interface MergeTarget {
  url: string;
  /** What follows `gh pr merge <url>`. */
  args: string[];
}

interface Mergeable {
  text: string;
  command?: string;
  prUrl?: string;
  prUrls?: string[];
}

const PR_PAGE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const METHOD: Record<string, string> = {
  '--merge': '--merge',
  '-m': '--merge',
  '--squash': '--squash',
  '-s': '--squash',
  '--rebase': '--rebase',
  '-r': '--rebase',
};

const numberOf = (url: string): string | undefined => PR_PAGE.exec(url)?.[3];

/** `gh pr merge …` as written in the ask: its PR and the flags worth keeping. */
function parseCommand(
  command: string,
): { pr?: string; repo?: string; method?: string; head?: string } | undefined {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'gh' || tokens[1] !== 'pr' || tokens[2] !== 'merge') return undefined;
  const found: { pr?: string; repo?: string; method?: string; head?: string } = {};
  for (let i = 3; i < tokens.length; i++) {
    const t = tokens[i];
    if (METHOD[t]) found.method = METHOD[t];
    else if ((t === '--repo' || t === '-R') && REPO.test(tokens[i + 1] ?? ''))
      found.repo = tokens[++i];
    else if (t === '--match-head-commit' && SHA.test(tokens[i + 1] ?? '')) found.head = tokens[++i];
    else if (!t.startsWith('-') && found.pr === undefined) found.pr = t.replace(/^#/, '');
  }
  return found;
}

export function mergeTargetOf(ask: Mergeable): MergeTarget | undefined {
  const parsed = ask.command ? parseCommand(ask.command) : undefined;
  if (!parsed && !/\bmerge/i.test(ask.text)) return undefined;
  const known = [...(ask.prUrl ? [ask.prUrl] : []), ...(ask.prUrls ?? [])].filter((u) =>
    PR_PAGE.test(u),
  );
  let url: string | undefined;
  if (parsed?.pr && PR_PAGE.test(parsed.pr)) url = parsed.pr;
  else if (parsed?.pr && /^\d+$/.test(parsed.pr)) {
    url = parsed.repo
      ? `https://github.com/${parsed.repo}/pull/${parsed.pr}`
      : known.find((u) => numberOf(u) === parsed.pr);
  } else {
    const distinct = [...new Set(known)];
    url =
      ask.prUrl && PR_PAGE.test(ask.prUrl)
        ? ask.prUrl
        : distinct.length === 1
          ? distinct[0]
          : undefined;
  }
  if (!url) return undefined;
  const args = [parsed?.method ?? '--merge'];
  if (parsed?.head) args.push('--match-head-commit', parsed.head);
  return { url, args };
}
