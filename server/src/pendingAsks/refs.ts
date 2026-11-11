/**
 * What a pending ask is about, read from its words: the PRs, migrations,
 * tickets and artifacts it names. Two asks about the same thing are one
 * thing to do (asked 2026-11-11: «se acumulan duplicados»): an agent's
 * «Te toca:» and Jarvis relaying it, or Jarvis asking twice in other words.
 *
 * Jarvis writes for the voice too, so a PR can come as «el PR dos mil
 * novecientos cincuenta y cuatro»: numbers of a hundred or more spelled in
 * words become digits first, both for the list and for this reading.
 */

const UNITS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
};
const TEENS: Record<string, number> = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

/** «dieciséis» → «dieciseis»: the tables are written without accents. */
const bare = (w: string): string => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type Kind = 'unit' | 'teen' | 'ten' | 'hundred' | 'mil';

function kindOf(word: string): { kind: Kind; value: number } | undefined {
  const w = bare(word);
  if (w === 'mil') return { kind: 'mil', value: 1000 };
  if (w in HUNDREDS) return { kind: 'hundred', value: HUNDREDS[w] };
  if (w in TENS) return { kind: 'ten', value: TENS[w] };
  if (w in TEENS) return { kind: 'teen', value: TEENS[w] };
  if (w in UNITS) return { kind: 'unit', value: UNITS[w] };
  return undefined;
}

const NUMBER_WORD = new RegExp(
  `^(?:${[...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), ...Object.keys(HUNDREDS), 'mil'].join('|')})$`,
);
const isNumberWord = (w: string) => NUMBER_WORD.test(bare(w));

/** Rank inside one number: a word may only follow a bigger one (or «mil»). */
const RANK: Record<Kind, number> = { mil: 4, hundred: 3, ten: 2, teen: 1, unit: 1 };

interface Run {
  start: number;
  end: number;
  value: number;
  big: boolean;
  words: number;
}

/**
 * The numbers in a run of number words: «ciento cuarenta y nueve y
 * ochocientos noventa y seis» is two. A word that cannot continue the
 * number so far starts the next one.
 */
function numbersIn(words: { w: string; start: number; end: number }[]): Run[] {
  const runs: Run[] = [];
  let total = 0;
  let group = 0;
  let last: Kind | undefined;
  let start = -1;
  let end = -1;
  let big = false;
  let pendingY = false;
  let count = 0;
  const flush = () => {
    if (start >= 0) runs.push({ start, end, value: total + group, big, words: count });
    count = 0;
    total = 0;
    group = 0;
    last = undefined;
    start = -1;
    big = false;
    pendingY = false;
  };
  for (const tok of words) {
    if (bare(tok.w) === 'y') {
      // «y» only joins tens and units: «cuarenta y nueve».
      if (last === 'ten') pendingY = true;
      else flush();
      continue;
    }
    const k = kindOf(tok.w);
    if (!k) {
      flush();
      continue;
    }
    const fits =
      last === undefined ||
      (k.kind === 'mil' && last !== 'mil' && total === 0) ||
      (pendingY
        ? k.kind === 'unit' && last === 'ten'
        : RANK[k.kind] < RANK[last] && !(last === 'ten' && k.kind === 'unit'));
    if (!fits) flush();
    if (start < 0) start = tok.start;
    if (k.kind === 'mil') {
      total = (group || 1) * 1000;
      group = 0;
      big = true;
    } else {
      group += k.value;
      if (k.kind === 'hundred') big = true;
    }
    last = k.kind;
    end = tok.end;
    count++;
    pendingY = false;
  }
  flush();
  return runs;
}

/**
 * Numbers of a hundred or more written in words, as digits: «el PR dos mil
 * novecientos cincuenta y cuatro» → «el PR 2954». Smaller ones stay words
 * («las dos decisiones» is not a number to read).
 */
export function numbersToDigits(text: string): string {
  const words = [...text.matchAll(/[\p{L}]+/gu)].map((m) => ({
    w: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  // Only stretches of number words (and the «y» between them) matter.
  const runs: Run[] = [];
  let stretch: typeof words = [];
  const close = () => {
    while (stretch.length && bare(stretch[stretch.length - 1].w) === 'y') stretch.pop();
    if (stretch.length) runs.push(...numbersIn(stretch));
    stretch = [];
  };
  for (let i = 0; i < words.length; i++) {
    const tok = words[i];
    const gap = i > 0 ? text.slice(words[i - 1].end, tok.start) : '';
    if (stretch.length && !/^\s+$/.test(gap)) close();
    if (isNumberWord(tok.w) || (stretch.length && bare(tok.w) === 'y')) stretch.push(tok);
    else close();
  }
  close();
  let out = text;
  for (const r of runs.filter((r) => r.big && r.value >= 100 && r.words >= 2).reverse()) {
    out = `${out.slice(0, r.start)}${r.value}${out.slice(r.end)}`;
  }
  return out;
}

const PR_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g;
const ARTIFACT_URL = /claude\.ai\/(?:code\/)?artifact\/([\w-]{8,})/g;
const TICKET = /\b([A-Z][A-Z0-9]{1,9}-\d{2,6})\b/g;
const MIGRATION = /\bM(\d{1,2})\b/g;

/** «#23», «PR 23», «PRs 149 y 896», «el PR #23 y el #24». */
export function prNumbers(text: string): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(/#(\d{1,7})\b/g)) found.push(Number(m[1]));
  for (const m of text.matchAll(/\bPRs?\b((?:\s*(?:#?\d{1,7}\b|,|y\b|e\b|el\b|los\b))+)/gi)) {
    for (const n of m[1].matchAll(/\d{1,7}/g)) found.push(Number(n[0]));
  }
  return [...new Set(found)];
}

/** The repo a `gh pr merge … --repo dueño/repo` names, and its PR number. */
function commandPr(command: string | undefined): { repo?: string; number?: number } {
  if (!command) return {};
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'gh' || tokens[1] !== 'pr') return {};
  let repo: string | undefined;
  let number: number | undefined;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === '--repo' || t === '-R') && /^[\w.-]+\/[\w.-]+$/.test(tokens[i + 1] ?? '')) {
      repo = tokens[++i].split('/')[1];
    } else if (/^#?\d{1,7}$/.test(t)) number ??= Number(t.replace('#', ''));
    else {
      const url = /\/([\w.-]+)\/pull\/(\d+)$/.exec(t);
      if (url) {
        repo ??= url[1];
        number ??= Number(url[2]);
      }
    }
  }
  return { repo, number };
}

/**
 * The things an ask is about, as keys: `pr:web#23` (or `pr:?#23` when the
 * repo is unknown), `migracion:M2`, `ticket:WISE-6517`, `artifact:<id>`.
 */
export function askRefs(text: string, command?: string): string[] {
  const refs = new Set<string>();
  const known = new Map<number, string>();
  const cmd = commandPr(command);
  if (cmd.number !== undefined) {
    refs.add(`pr:${cmd.repo?.toLowerCase() ?? '?'}#${cmd.number}`);
    if (cmd.repo) known.set(cmd.number, cmd.repo.toLowerCase());
  }
  for (const m of text.matchAll(PR_URL)) {
    refs.add(`pr:${m[2].toLowerCase()}#${m[3]}`);
    known.set(Number(m[3]), m[2].toLowerCase());
  }
  for (const n of prNumbers(text.replace(PR_URL, ' '))) {
    refs.add(`pr:${known.get(n) ?? '?'}#${n}`);
  }
  for (const m of text.matchAll(MIGRATION)) refs.add(`migracion:M${m[1]}`);
  for (const m of text.matchAll(TICKET)) refs.add(`ticket:${m[1]}`);
  for (const m of text.matchAll(ARTIFACT_URL)) refs.add(`artifact:${m[1]}`);
  // A bare «#23» next to the same number with its repo is that one.
  for (const r of [...refs]) {
    const bareNumber = /^pr:\?#(\d+)$/.exec(r);
    if (bareNumber && known.has(Number(bareNumber[1]))) refs.delete(r);
  }
  return [...refs];
}

/** Two refs name the same thing: a PR without a repo matches it in any repo. */
function sameRef(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = /^pr:([^#]+)#(\d+)$/.exec(a);
  const pb = /^pr:([^#]+)#(\d+)$/.exec(b);
  if (!pa || !pb || pa[2] !== pb[2]) return false;
  return pa[1] === '?' || pb[1] === '?';
}

export function shareRef(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.some((y) => sameRef(x, y)));
}

/** The PR URL a `gh pr merge … --repo dueño/repo` points to, when it says. */
export function commandPrUrl(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const direct = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.exec(command);
  if (direct) return direct[0];
  const tokens = command.trim().split(/\s+/);
  const repoAt = tokens.findIndex((t) => t === '--repo' || t === '-R');
  const repo = repoAt >= 0 ? tokens[repoAt + 1] : undefined;
  const number = tokens.slice(3).find((t) => /^#?\d{1,7}$/.test(t));
  if (
    tokens[0] !== 'gh' ||
    tokens[1] !== 'pr' ||
    !repo ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !number
  ) {
    return undefined;
  }
  return `https://github.com/${repo}/pull/${number.replace('#', '')}`;
}

/**
 * Whether merging its PRs is all the ask asks: «mergear #2954 a main y
 * cerrar #2953, y avisarme» is done once they merge; «mergear #12 y
 * publicar» still has a second half.
 */
export function onlyMerge(text: string): boolean {
  // What follows «:» describes the PR; «después…», «así…» is someone else's part.
  const head = text
    .replace(PR_URL, ' #PR ')
    .split(/[:;]/)[0]
    .replace(/,?\s*\b(?:después|despues|así|asi|para que)\b.*$/i, '');
  if (!/\bmerge/i.test(head)) return false;
  const rest = head
    .replace(PR_URL, ' ')
    .replace(/\b(?:revisar\s+y\s+)?merge\w*\b/gi, ' ')
    .replace(/\bcerrar\b/gi, ' ')
    .replace(/\b(?:y\s+)?(?:avisarme|avísame|avisame|decirme)\b[^,.;]*/gi, ' ')
    .replace(/#\d+|\bPRs?\b|\d+/gi, ' ')
    .replace(
      /\b(?:el|la|los|las|de|del|a|al|en|y|e|con|desde|hacia|si|te|cierra|main|develop|master|webapp|web|app|api|back|front|señor|ya)\b/gi,
      ' ',
    )
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
  return rest.length === 0;
}
