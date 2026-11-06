import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PendingAskEntry, PendingAsksList } from '../../../core/src/messages.js';
import { SERVER_JSON_DIR } from '../constants.js';
import { prStateOf } from '../mergedAsk.js';
import { type MergeTarget, mergeTargetOf } from './mergeTarget.js';

export const PENDING_ASKS_FILE = 'pendientes.json';
const TEXT_MAX = 240;
/** Closed ones kept, to see what happened and to reopen one. */
const CLOSED_KEPT = 100;
const CLOSED_SHOWN = 30;
/** Turns remembered so an old answer never comes back as a new ask. */
const SEEN_KEPT = 1000;

export const REPLACED_BY = 'Lo reemplazó';

export interface StoredAsk {
  id: string;
  from: string;
  text: string;
  at: number;
  /** The transcript answers that asked this (more than one if repeated). */
  turnIds: string[];
  command?: string;
  /** The one PR it is only about: merged, nothing is left to do. */
  prUrl?: string;
  /** The permission it asks about: decided, nothing is left to do. */
  permission?: string;
  closedAt?: number;
  closedHow?: string;
  /** Brought back by hand: what a browser remembers from before must not close it. */
  reopened?: boolean;
  /** A question Jarvis left without «Te toca:» (openQuestion.ts): his next
   *  words to Jarvis answer it. */
  question?: boolean;
  /** Every PR it names: once they are all merged, it probably is done. */
  prUrls?: string[];
  /** Why it looks done though nobody closed it («Se mergeó el PR #12»). */
  seemsDone?: string;
  /** It has to be done before this (ms). */
  due?: number;
  /** Not before this (ms): «a las 23», or put off with «Más tarde». */
  notBefore?: number;
  /** Why now, and what happens if not (Jarvis, dejar_pendiente). */
  why?: string;
  ifNot?: string;
}

/** What Jarvis can say about an ask beyond its text (dejar_pendiente). */
export type AskTiming = Pick<StoredAsk, 'due' | 'notBefore' | 'why' | 'ifNot'>;

interface Saved {
  version: 1;
  nextId: number;
  asks: StoredAsk[];
  seen: string[];
}

export interface NewAsk {
  from: string;
  text: string;
  at?: number;
  turnId?: string;
  command?: string;
  prUrl?: string;
  permission?: string;
  question?: boolean;
  prUrls?: string[];
  seemsDone?: string;
  due?: number;
  notBefore?: number;
  why?: string;
  ifNot?: string;
}

interface PendingAsksDeps {
  broadcast: (message: PendingAsksList) => void;
  file?: string;
  now?: () => number;
}

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

interface PrRef {
  repo?: string;
  number: number;
}

const PR_URL = /https:\/\/github\.com\/[^/\s)]+\/([^/\s)]+)\/pull\/(\d+)/g;
const PR_NUMBER = /#(\d{1,7})\b/g;

function prRefs(text: string): PrRef[] {
  const refs: PrRef[] = [...text.matchAll(PR_URL)].map((m) => ({
    repo: m[1],
    number: Number(m[2]),
  }));
  for (const m of text.replace(PR_URL, ' ').matchAll(PR_NUMBER)) {
    refs.push({ number: Number(m[1]) });
  }
  return refs;
}

/** Two asks about the same PR: a bare «#23» matches any repo, two URLs must agree. */
function sharePr(a: string, b: string): boolean {
  const theirs = prRefs(b);
  return prRefs(a).some((x) =>
    theirs.some((y) => x.number === y.number && (!x.repo || !y.repo || x.repo === y.repo)),
  );
}

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
const prLabel = (url: string): string => `#${url.split('/').pop() ?? ''}`;

/** The PR URLs an ask names: its own links, and «#12» when the agent's
 *  answers linked that number before (`known`, mergedAsk.ts). */
export function prUrlsOf(text: string, known?: ReadonlyMap<number, string>): string[] {
  const urls = [...text.matchAll(PR_URL)].map((m) => m[0]);
  for (const m of text.replace(PR_URL, ' ').matchAll(PR_NUMBER)) {
    const url = known?.get(Number(m[1]));
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

const folded = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * What Valentín has pending, whoever asked it, kept in
 * ~/.pixel-agents/pendientes.json: it outlives the agent that asked, Claude Code
 * cleaning its transcripts and any restart. An ask leaves the list by hand, by
 * Jarvis once it checked it was done, or when its PR merges, its permission is
 * decided or a newer ask about the same PR takes its place. Closed ones stay
 * for a while: a wrong replacement can be reopened, so nothing is lost silently.
 */
export class PendingAsks {
  private readonly file: string;
  private readonly now: () => number;
  private nextId = 1;
  private asks: StoredAsk[] = [];
  private seen = new Set<string>();

  constructor(private readonly deps: PendingAsksDeps) {
    this.file = deps.file ?? path.join(os.homedir(), SERVER_JSON_DIR, PENDING_ASKS_FILE);
    this.now = deps.now ?? Date.now;
    this.load();
  }

  message(): PendingAsksList {
    const closed = this.asks
      .filter((a) => a.closedAt !== undefined)
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, CLOSED_SHOWN);
    return { type: 'pendingAsks', open: this.open().map(toEntry), closed: closed.map(toEntry) };
  }

  /** Still pending, oldest first: what has waited longest stays on top —
   *  below it what only looks done, waiting for a last look. */
  open(): StoredAsk[] {
    return this.asks
      .filter((a) => a.closedAt === undefined)
      .sort((a, b) => Number(!!a.seemsDone) - Number(!!b.seemsDone) || a.at - b.at);
  }

  hasSeen(turnId: string): boolean {
    return this.seen.has(turnId);
  }

  /** Adds an ask; the one already there if it repeats. A newer one about the same PR replaces. */
  add(ask: NewAsk): StoredAsk | undefined {
    const text = ask.text.trim().slice(0, TEXT_MAX);
    if (!text) return undefined;
    if (ask.turnId) this.remember(ask.turnId);
    const repeated = this.open().find((a) => folded(a.text) === folded(text));
    if (repeated) {
      if (ask.turnId) repeated.turnIds.push(ask.turnId);
      this.changed();
      return repeated;
    }
    const stored: StoredAsk = {
      id: `p${this.nextId++}`,
      from: ask.from,
      text,
      at: ask.at ?? this.now(),
      turnIds: ask.turnId ? [ask.turnId] : [],
      ...(ask.command ? { command: ask.command } : {}),
      ...(ask.prUrl ? { prUrl: ask.prUrl } : {}),
      ...(ask.permission ? { permission: ask.permission } : {}),
      ...(ask.question ? { question: true } : {}),
      ...(ask.prUrls?.length ? { prUrls: [...new Set(ask.prUrls)] } : {}),
      ...(ask.seemsDone ? { seemsDone: ask.seemsDone } : {}),
      ...(ask.due !== undefined ? { due: ask.due } : {}),
      ...(ask.notBefore !== undefined ? { notBefore: ask.notBefore } : {}),
      ...(ask.why?.trim() ? { why: ask.why.trim().slice(0, TEXT_MAX) } : {}),
      ...(ask.ifNot?.trim() ? { ifNot: ask.ifNot.trim().slice(0, TEXT_MAX) } : {}),
    };
    for (const older of this.open()) {
      if (sharePr(older.text, text)) this.close(older, `${REPLACED_BY} ${stored.id}`);
    }
    this.asks.push(stored);
    this.changed();
    return stored;
  }

  /** By its id («p3», «P3» or «3»); what it found, even if it was closed already. */
  find(id: string): StoredAsk | undefined {
    const wanted = id.trim().toLowerCase();
    const full = /^\d+$/.test(wanted) ? `p${wanted}` : wanted;
    return this.asks.find((a) => a.id === full);
  }

  /** The ask a transcript answer brought, if it is on the list. */
  byTurn(turnId: string): StoredAsk | undefined {
    return this.asks.find((a) => a.turnIds.includes(turnId));
  }

  closeById(id: string, how: string): StoredAsk | undefined {
    const ask = this.find(id);
    if (!ask || ask.closedAt !== undefined) return undefined;
    this.close(ask, how);
    this.changed();
    return ask;
  }

  reopen(id: string): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt === undefined) return;
    delete ask.closedAt;
    delete ask.closedHow;
    ask.reopened = true;
    this.changed();
  }

  /**
   * «Hecho» on a card or the visor; `sync`: a page reminding the office of what
   * its browser marked before, which never undoes a later «Reabrir».
   */
  markTurnsDone(turnIds: readonly string[], sync = false): void {
    let changed = false;
    for (const turnId of turnIds) {
      this.remember(turnId);
      for (const ask of this.open()) {
        if (!ask.turnIds.includes(turnId) || (sync && ask.reopened)) continue;
        this.close(ask, 'Lo marcaste hecho');
        changed = true;
      }
    }
    // Remembering a turn shows nothing: only a closed ask needs the page to hear.
    if (changed) this.changed();
    else this.save();
  }

  closeByPr(url: string, how: string): void {
    this.closeWhere((a) => a.prUrl === url, how);
  }

  closeByPermission(keep: string | undefined, how: string): void {
    this.closeWhere((a) => !!a.permission && a.permission !== keep, how);
  }

  /** He wrote to Jarvis at `at`: the questions it left before that are answered. */
  closeAnswered(at: number): void {
    this.closeWhere((a) => !!a.question && a.at < at, 'Le contestaste a Jarvis');
  }

  /** Whether `from` left one at or after `since` (open or not). */
  addedSince(from: string, since: number): boolean {
    return this.asks.some((a) => a.from === from && a.at >= since);
  }

  /** The PRs the open ones name, for the office to watch. */
  prUrls(): string[] {
    const urls = this.open().flatMap((a) => {
      const merge = mergeTargetOf(a)?.url;
      return [...(a.prUrls ?? []), ...(a.prUrl ? [a.prUrl] : []), ...(merge ? [merge] : [])];
    });
    return [...new Set(urls)];
  }

  /** A PR changed state: what looks done, and which «Mergear» buttons still make sense. */
  prChanged(url: string, stateOf: (url: string) => string | undefined): void {
    this.settlePrs(stateOf);
    if (this.open().some((a) => mergeTargetOf(a)?.url === url)) this.changed();
  }

  /** It was merged from its «Mergear» button. */
  merged(id: string): StoredAsk | undefined {
    return this.closeById(id, 'Lo mergeaste desde la oficina');
  }

  /**
   * A PR settled: an open ask whose PRs are now all settled, one of them
   * merged, looks done. Only looks: «mergear #12 y publicar» has a second
   * half, so it waits for «Hecho» (or Jarvis) instead of closing by itself.
   */
  settlePrs(stateOf: (url: string) => string | undefined): void {
    let changed = false;
    for (const ask of this.open()) {
      const urls = ask.prUrls ?? [];
      if (ask.seemsDone || urls.length === 0) continue;
      const states = urls.map(stateOf);
      if (!states.every((s) => s === 'merged' || s === 'closed')) continue;
      const merged = urls.filter((_, i) => states[i] === 'merged').map(prLabel);
      if (merged.length === 0) continue;
      ask.seemsDone =
        merged.length === 1
          ? `Se mergeó el PR ${merged[0]}`
          : `Se mergearon los PRs ${merged.join(', ')}`;
      changed = true;
    }
    if (changed) this.changed();
  }

  /** «Más tarde»: it leaves the front until `until`. */
  snooze(id: string, until: number): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt !== undefined) return;
    ask.notBefore = until;
    this.changed();
  }

  /** «Sigue pendiente»: it did not look done to him after all. */
  keep(id: string): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt !== undefined || !ask.seemsDone) return;
    delete ask.seemsDone;
    this.changed();
  }

  private closeWhere(matches: (ask: StoredAsk) => boolean, how: string): void {
    const found = this.open().filter(matches);
    if (found.length === 0) return;
    for (const ask of found) this.close(ask, how);
    this.changed();
  }

  private close(ask: StoredAsk, how: string): void {
    ask.closedAt = this.now();
    ask.closedHow = how;
  }

  private remember(turnId: string): void {
    this.seen.add(turnId);
    if (this.seen.size <= SEEN_KEPT) return;
    this.seen = new Set([...this.seen].slice(-SEEN_KEPT));
  }

  private changed(): void {
    const closed = this.asks.filter((a) => a.closedAt !== undefined);
    if (closed.length > CLOSED_KEPT) {
      const gone = new Set(
        closed.sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0)).slice(0, -CLOSED_KEPT),
      );
      this.asks = this.asks.filter((a) => !gone.has(a));
    }
    this.save();
    this.deps.broadcast(this.message());
  }

  private load(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Saved>;
      if (saved.version !== 1 || !Array.isArray(saved.asks)) return;
      this.asks = saved.asks;
      this.nextId = saved.nextId ?? this.asks.length + 1;
      this.seen = new Set(saved.seen ?? []);
    } catch {
      // None yet, or damaged: it starts empty rather than failing the office.
    }
  }

  private save(): void {
    const saved: Saved = {
      version: 1,
      nextId: this.nextId,
      asks: this.asks,
      seen: [...this.seen],
    };
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(saved), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn(`[Pixel Agents] Could not save the pending asks: ${String(err)}`);
    }
  }
}

/** The PR its «Mergear» button merges: only while it is not merged or closed. */
export function openMergeTarget(ask: StoredAsk): MergeTarget | undefined {
  if (ask.closedAt !== undefined) return undefined;
  const target = mergeTargetOf(ask);
  const state = target ? prStateOf(target.url) : undefined;
  return state === 'merged' || state === 'closed' ? undefined : target;
}

function toEntry(ask: StoredAsk): PendingAskEntry {
  const merge = openMergeTarget(ask);
  const open = ask.closedAt === undefined;
  return {
    id: ask.id,
    from: ask.from,
    text: ask.text,
    at: ask.at,
    ...(ask.command ? { command: ask.command } : {}),
    ...(open && ask.due !== undefined ? { due: ask.due } : {}),
    ...(open && ask.notBefore !== undefined ? { notBefore: ask.notBefore } : {}),
    ...(open && ask.why ? { why: ask.why } : {}),
    ...(open && ask.ifNot ? { ifNot: ask.ifNot } : {}),
    ...(open && ask.question ? { question: true } : {}),
    ...(merge
      ? { mergeUrl: merge.url, mergeCommand: `gh pr merge ${merge.url} ${merge.args.join(' ')}` }
      : {}),
    ...(ask.seemsDone && ask.closedAt === undefined ? { seemsDone: ask.seemsDone } : {}),
    ...(ask.closedAt !== undefined ? { closedAt: ask.closedAt } : {}),
    ...(ask.closedHow ? { closedHow: ask.closedHow } : {}),
    ...(ask.closedAt !== undefined && ask.turnIds.length > 0 ? { turnIds: ask.turnIds } : {}),
  };
}
