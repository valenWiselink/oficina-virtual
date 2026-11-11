import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PendingAskEntry, PendingAsksList } from '../../../core/src/messages.js';
import { SERVER_JSON_DIR } from '../constants.js';
import { prStateOf } from '../mergedAsk.js';
import { type MergeTarget, mergeTargetOf } from './mergeTarget.js';
import { askRefs, commandPrUrl, numbersToDigits, onlyMerge, prNumbers, shareRef } from './refs.js';

export const PENDING_ASKS_FILE = 'pendientes.json';
const TEXT_MAX = 240;
/** Closed ones kept, to see what happened and to reopen one. */
const CLOSED_KEPT = 100;
const CLOSED_SHOWN = 30;
/** Turns remembered so an old answer never comes back as a new ask. */
const SEEN_KEPT = 1000;
/** Earlier wordings kept on an ask that was asked again. */
const HISTORY_KEPT = 8;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** What a closing agent left waits this long for Jarvis to take it. */
export const HOLD_MS = 5 * MINUTE;
/** Answered and nobody reopened it: done. */
export const ANSWER_SETTLE_MS = 2 * HOUR;
/** Nobody touched it in this long: «¿Sigue?». */
export const STALE_MS = 24 * HOUR;

export const JARVIS = 'Jarvis';
export const ANSWERED_HOW = 'Le contestaste a Jarvis';

export interface AskVersion {
  at: number;
  from: string;
  text: string;
}

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
  /** Jarvis's own name for it: asked again under it, it is the same ask. */
  key?: string;
  /** What it is about (refs.ts): another ask about the same thing joins it. */
  refs?: string[];
  /** The answers it waits for («Sí», «No», «La A»): one tap each. */
  options?: string[];
  /** How it was worded before it was asked again. */
  history?: AskVersion[];
  /** He answered it; it waits for Jarvis to check, or closes by itself. */
  answeredAt?: number;
  answeredHow?: string;
  /** A closing agent left it: out of sight until Jarvis had time to take it. */
  heldUntil?: number;
  /** Last time anyone asked, answered or kept it. */
  touchedAt?: number;
  /** Nobody touched it in a day: «¿Sigue?». */
  staleSince?: number;
  /** The meeting it waits for, by title: the page puts it after that meeting ends. */
  after?: string;
  /** The PR it waits for: out of sight until it merges. */
  afterPr?: string;
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
  key?: string;
  options?: string[];
  /** The meeting it waits for, by title («después de: Demo AgroActiva»). */
  after?: string;
  /** The PR it waits for: out of sight until it merges. */
  afterPr?: string;
  /** Ids it takes the place of: they join it instead of staying apart. */
  replaces?: string[];
  /** Keep it out of sight this long (a closing agent's ask). */
  holdMs?: number;
  /** PR numbers the office knows the URL of (agents' links). */
  knownPrs?: ReadonlyMap<number, string>;
}

interface PendingAsksDeps {
  broadcast: (message: PendingAsksList) => void;
  /** Tell Jarvis, in its terminal, what Valentín settled by hand. */
  tellJarvis?: (text: string) => void;
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
const prLabel = (url: string): string => `#${url.split('/').pop() ?? ''}`;

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

const folded = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');
const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const hourOf = (ms: number): string =>
  new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** «listo», «ya lo hice», «sí», «no», «dale»: a short answer to what was just asked. */
const SHORT_ANSWER =
  /^\s*(?:listo|lista|hecho|hecha|ya|dale|s[ií]|no|ok|okey|de una|perfecto|joya|confirmo|confirmado|aprobado|corrid[oa]|mergead[oa])(?!\p{L})/iu;
const ALL_OF_THEM = /\b(?:todo|todos|todas|ambos|ambas|los dos|las dos|los tres|las tres)\b/i;
const ID_IN_TEXT = /\[?\b(p\d{1,5})\b\]?/gi;

/**
 * What Valentín has pending, whoever asked it, kept in
 * ~/.pixel-agents/pendientes.json: it outlives the agent that asked, Claude Code
 * cleaning its transcripts and any restart. Asked again (same key, same text or
 * the same PR, migration, ticket or artifact) it is the same ask, worded anew.
 * It leaves the list by hand («Hecho» tells Jarvis), by Jarvis, when he answers
 * it (then it waits for Jarvis or closes by itself in two hours), when its PRs
 * merge, or when its permission is decided. Closed ones stay for a while: one
 * can be reopened, so nothing is lost silently. The file stays version 1: new
 * fields are optional, so an older office still reads it.
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

  /** Still pending and in sight, oldest first: what has waited longest stays
   *  on top — below it what only looks done, waiting for a last look. */
  open(): StoredAsk[] {
    const now = this.now();
    return this.pending()
      .filter((a) => a.heldUntil === undefined || a.heldUntil <= now)
      .filter((a) => a.afterPr === undefined)
      .sort((a, b) => Number(lookDone(a)) - Number(lookDone(b)) || a.at - b.at);
  }

  /** Not closed, held ones too (a closing agent's ask Jarvis may still take). */
  pending(): StoredAsk[] {
    return this.asks.filter((a) => a.closedAt === undefined);
  }

  hasSeen(turnId: string): boolean {
    return this.seen.has(turnId);
  }

  /**
   * Adds an ask, or joins the one already about the same thing: the one it
   * replaces, the same key, the same words, or the same PR, migration,
   * ticket or artifact. Joined, the newer wording wins (Jarvis's over an
   * agent's) and the older one is kept in its history.
   */
  add(ask: NewAsk): StoredAsk | undefined {
    const text = numbersToDigits(ask.text.trim()).slice(0, TEXT_MAX);
    if (!text) return undefined;
    if (ask.turnId) this.remember(ask.turnId);
    const at = ask.at ?? this.now();
    const prUrls = this.prUrlsFor(ask, text);
    const refs = [
      ...new Set([...askRefs(text, ask.command), ...prUrls.flatMap((u) => askRefs(u))]),
    ];
    const incoming = { ...ask, text, at, prUrls, refs };
    const target = this.sameThing(incoming);
    if (target) {
      this.join(target, incoming);
      this.changed();
      return target;
    }
    const stored = this.create(incoming);
    this.asks.push(stored);
    this.changed();
    return stored;
  }

  private prUrlsFor(ask: NewAsk, text: string): string[] {
    const fromCommand = commandPrUrl(ask.command);
    return [
      ...new Set([
        ...(ask.prUrls ?? []),
        ...prUrlsOf(text, ask.knownPrs),
        ...(fromCommand ? [fromCommand] : []),
      ]),
    ];
  }

  /** The pending ask this one is about too, if any; the others it replaces close. */
  private sameThing(incoming: NewAsk & { text: string; refs: string[] }): StoredAsk | undefined {
    const pending = this.pending();
    const replaced = (incoming.replaces ?? [])
      .map((id) => this.find(id))
      .filter((a): a is StoredAsk => !!a && a.closedAt === undefined);
    const [first, ...others] = replaced;
    if (first) {
      for (const other of others) this.close(other, `Se juntó con ${first.id}`);
      return first;
    }
    return (
      (incoming.key ? pending.find((a) => a.key === incoming.key) : undefined) ??
      pending.find((a) => folded(a.text) === folded(incoming.text)) ??
      (incoming.refs.length > 0
        ? pending.find((a) => shareRef(a.refs ?? askRefs(a.text, a.command), incoming.refs))
        : undefined)
    );
  }

  private create(
    ask: NewAsk & { text: string; at: number; prUrls: string[]; refs: string[] },
  ): StoredAsk {
    return {
      id: `p${this.nextId++}`,
      from: ask.from,
      text: ask.text,
      at: ask.at,
      turnIds: ask.turnId ? [ask.turnId] : [],
      ...(ask.command ? { command: ask.command } : {}),
      ...(ask.prUrl ? { prUrl: ask.prUrl } : {}),
      ...(ask.permission ? { permission: ask.permission } : {}),
      ...(ask.question ? { question: true } : {}),
      ...(ask.prUrls.length ? { prUrls: ask.prUrls } : {}),
      ...(ask.refs.length ? { refs: ask.refs } : {}),
      ...(ask.seemsDone ? { seemsDone: ask.seemsDone } : {}),
      ...(ask.due !== undefined ? { due: ask.due } : {}),
      ...(ask.notBefore !== undefined ? { notBefore: ask.notBefore } : {}),
      ...(ask.why?.trim() ? { why: clip(ask.why.trim(), TEXT_MAX) } : {}),
      ...(ask.ifNot?.trim() ? { ifNot: clip(ask.ifNot.trim(), TEXT_MAX) } : {}),
      ...(ask.key?.trim() ? { key: ask.key.trim() } : {}),
      ...(ask.options?.length
        ? { options: ask.options.map((o) => clip(o.trim(), 60)).filter(Boolean) }
        : {}),
      ...(ask.holdMs ? { heldUntil: this.now() + ask.holdMs } : {}),
      ...(ask.after?.trim() ? { after: ask.after.trim() } : {}),
      ...(ask.afterPr ? { afterPr: ask.afterPr } : {}),
    };
  }

  /** The same thing asked again: one ask, worded anew, with what it had. */
  private join(
    target: StoredAsk,
    incoming: NewAsk & { text: string; at: number; prUrls: string[]; refs: string[] },
  ): void {
    this.reword(target, incoming);
    if (incoming.turnId && !target.turnIds.includes(incoming.turnId))
      target.turnIds.push(incoming.turnId);
    if (incoming.command) target.command = incoming.command;
    target.prUrl ??= incoming.prUrl;
    target.permission ??= incoming.permission;
    target.key ??= incoming.key?.trim() || undefined;
    if (incoming.options?.length) target.options = incoming.options;
    if (incoming.after?.trim()) target.after = incoming.after.trim();
    if (incoming.afterPr) target.afterPr = incoming.afterPr;
    for (const field of ['due', 'notBefore', 'why', 'ifNot'] as const) {
      if (incoming[field] !== undefined)
        (target as unknown as Record<string, unknown>)[field] = incoming[field];
    }
    const prUrls = [...new Set([...(target.prUrls ?? []), ...incoming.prUrls])];
    if (prUrls.length) target.prUrls = prUrls;
    target.refs = [...new Set([...(target.refs ?? []), ...incoming.refs])];
    // Jarvis took what a closing agent left: it is his now, and in sight.
    if (target.heldUntil !== undefined && !incoming.holdMs) delete target.heldUntil;
    target.touchedAt = this.now();
    delete target.staleSince;
  }

  /** The newer wording wins, unless an agent repeats what Jarvis already said. */
  private reword(target: StoredAsk, incoming: { from: string; text: string; at: number }): void {
    if (folded(target.text) === folded(incoming.text)) return;
    const keepJarvis = target.from === JARVIS && incoming.from !== JARVIS;
    const older: AskVersion = keepJarvis
      ? { at: incoming.at, from: incoming.from, text: incoming.text }
      : { at: target.at, from: target.from, text: target.text };
    target.history = [...(target.history ?? []), older].slice(-HISTORY_KEPT);
    if (keepJarvis) return;
    target.text = incoming.text;
    target.from = incoming.from;
    // Asked again in new words after he answered: it is pending again.
    if (target.answeredAt !== undefined && incoming.at > target.answeredAt) {
      delete target.answeredAt;
      delete target.answeredHow;
    }
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

  /** «Hecho» on a card: closed, and Jarvis hears it (whoever waited on it can go on). */
  closeByHand(id: string): StoredAsk | undefined {
    const ask = this.closeById(id, 'Lo marcaste hecho');
    if (ask) this.tellDone([ask]);
    return ask;
  }

  reopen(id: string): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt === undefined) return;
    delete ask.closedAt;
    delete ask.closedHow;
    delete ask.answeredAt;
    delete ask.answeredHow;
    delete ask.staleSince;
    delete ask.heldUntil;
    ask.reopened = true;
    ask.touchedAt = this.now();
    this.changed();
  }

  /**
   * «Hecho» on a card or the visor; `sync`: a page reminding the office of what
   * its browser marked before, which never undoes a later «Reabrir» and tells
   * Jarvis nothing (he heard it then).
   */
  markTurnsDone(turnIds: readonly string[], sync = false): void {
    const closed: StoredAsk[] = [];
    for (const turnId of turnIds) {
      this.remember(turnId);
      for (const ask of this.pending()) {
        if (!ask.turnIds.includes(turnId) || (sync && ask.reopened)) continue;
        this.close(ask, 'Lo marcaste hecho');
        closed.push(ask);
      }
    }
    // Remembering a turn shows nothing: only a closed ask needs the page to hear.
    if (closed.length === 0) {
      this.save();
      return;
    }
    this.changed();
    if (!sync) this.tellDone(closed);
  }

  private tellDone(asks: readonly StoredAsk[]): void {
    if (!this.deps.tellJarvis || asks.length === 0) return;
    const list = asks.map((a) => `${a.id} («${clip(a.text, 120)}»)`).join(', ');
    this.deps.tellJarvis(
      `[Oficina] Valentín marcó hecho ${list}. Si alguien esperaba eso, avisale; no hace falta que se lo confirmes a él.`,
    );
  }

  /**
   * He wrote to Jarvis (`text`, at `at`; his previous message was at `since`):
   * the asks it names by id are answered, and a short «listo», «sí», «ya lo
   * hice» answers what Jarvis asked since his previous message — the one, or
   * all of them with «todo», «los dos». Answered, an ask leaves «Ahora» and
   * waits for Jarvis to check (or closes by itself in two hours).
   */
  answeredBy(text: string, at: number, since = 0): StoredAsk[] {
    const said = text.trim();
    if (!said) return [];
    const named = [...said.matchAll(ID_IN_TEXT)]
      .map((m) => this.find(m[1]))
      .filter((a): a is StoredAsk => !!a && a.closedAt === undefined);
    const answered =
      named.length > 0 ? [...new Set(named)] : this.shortAnswerTargets(said, at, since);
    const how = `${ANSWERED_HOW}: «${clip(said.replace(ID_IN_TEXT, '').trim() || said, 80)}»`;
    for (const ask of answered) {
      if (ask.answeredAt !== undefined) continue;
      ask.answeredAt = at;
      ask.answeredHow = how;
      ask.touchedAt = at;
      delete ask.staleSince;
    }
    if (answered.length > 0) this.changed();
    return answered;
  }

  private shortAnswerTargets(said: string, at: number, since: number): StoredAsk[] {
    if (said.length > 120 || !SHORT_ANSWER.test(said)) return [];
    const recent = this.open().filter(
      (a) =>
        a.from === JARVIS &&
        a.answeredAt === undefined &&
        !a.question &&
        (a.touchedAt ?? a.at) > since &&
        (a.touchedAt ?? a.at) <= at,
    );
    if (recent.length === 1) return recent;
    return recent.length > 1 && ALL_OF_THEM.test(said) ? recent : [];
  }

  closeByPr(url: string, how: string): void {
    this.closeWhere((a) => a.prUrl === url, how);
  }

  closeByPermission(keep: string | undefined, how: string): void {
    this.closeWhere((a) => !!a.permission && a.permission !== keep, how);
  }

  /** He wrote to Jarvis at `at`: the questions it left before that are answered. */
  closeAnswered(at: number): void {
    this.closeWhere((a) => !!a.question && a.at < at, ANSWERED_HOW);
  }

  /** Whether `from` left one at or after `since` (open or not). */
  addedSince(from: string, since: number): boolean {
    return this.asks.some((a) => a.from === from && a.at >= since);
  }

  /** The PRs the open ones name, for the office to watch. */
  prUrls(): string[] {
    const urls = this.pending().flatMap((a) => {
      const merge = mergeTargetOf(a)?.url;
      return [
        ...(a.prUrls ?? []),
        ...(a.prUrl ? [a.prUrl] : []),
        ...(merge ? [merge] : []),
        ...(a.afterPr ? [a.afterPr] : []),
      ];
    });
    return [...new Set(urls)];
  }

  /** A PR changed state: what is done or looks done, and which «Mergear» buttons still make sense. */
  prChanged(url: string, stateOf: (url: string) => string | undefined): void {
    this.settlePrs(stateOf);
    // What waited for this PR comes into sight once it merged.
    const waiting = this.pending().filter((a) => a.afterPr === url && stateOf(url) === 'merged');
    for (const ask of waiting) {
      delete ask.afterPr;
      ask.touchedAt = this.now();
    }
    if (waiting.length > 0 || this.open().some((a) => mergeTargetOf(a)?.url === url)) {
      this.changed();
    }
  }

  /** It was merged from its «Mergear» button. */
  merged(id: string): StoredAsk | undefined {
    return this.closeById(id, 'Lo mergeaste desde la oficina');
  }

  /**
   * A PR settled: an open ask whose PRs are now all settled, one of them
   * merged, is done when merging was all it asked («mergear #2954 y
   * avisarme»), and only looks done when there is more («mergear #12 y
   * publicar»): that waits for «Hecho» or Jarvis.
   */
  settlePrs(stateOf: (url: string) => string | undefined): void {
    let changed = false;
    for (const ask of this.pending()) {
      const urls = [...new Set([...(ask.prUrls ?? []), ...(ask.prUrl ? [ask.prUrl] : [])])];
      if (ask.seemsDone || urls.length === 0) continue;
      const states = urls.map(stateOf);
      if (!states.every((s) => s === 'merged' || s === 'closed')) continue;
      const merged = urls.filter((_, i) => states[i] === 'merged').map(prLabel);
      if (merged.length === 0) continue;
      const how =
        merged.length === 1
          ? `Se mergeó el PR ${merged[0]}`
          : `Se mergearon los PRs ${merged.join(', ')}`;
      if (onlyMerge(ask.text)) this.close(ask, how);
      else ask.seemsDone = how;
      changed = true;
    }
    if (changed) this.changed();
  }

  /**
   * The clock moved: what a closing agent left comes into sight once Jarvis
   * had his time, what he answered two hours ago closes, and what nobody
   * touched in a day asks «¿Sigue?».
   */
  tick(): void {
    const now = this.now();
    let changed = false;
    for (const ask of this.pending()) {
      if (ask.heldUntil !== undefined && ask.heldUntil <= now) {
        delete ask.heldUntil;
        changed = true;
      }
      if (ask.answeredAt !== undefined && now - ask.answeredAt >= ANSWER_SETTLE_MS) {
        this.close(ask, ask.answeredHow ?? ANSWERED_HOW);
        changed = true;
      } else if (isStale(ask, now)) {
        ask.staleSince = now;
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  /** «Más tarde»: it leaves the front until `until`. */
  snooze(id: string, until: number): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt !== undefined) return;
    ask.notBefore = until;
    // Put off by hand: the new time wins over the meeting it waited for.
    delete ask.after;
    ask.touchedAt = this.now();
    delete ask.staleSince;
    this.changed();
  }

  /** «Sigue pendiente»: it did not look done to him after all. */
  keep(id: string): void {
    const ask = this.find(id);
    if (!ask || ask.closedAt !== undefined || !lookDone(ask)) return;
    delete ask.seemsDone;
    delete ask.answeredAt;
    delete ask.answeredHow;
    delete ask.staleSince;
    ask.touchedAt = this.now();
    this.changed();
  }

  private closeWhere(matches: (ask: StoredAsk) => boolean, how: string): void {
    const found = this.pending().filter(matches);
    if (found.length === 0) return;
    for (const ask of found) this.close(ask, how);
    this.changed();
  }

  private close(ask: StoredAsk, how: string): void {
    ask.closedAt = this.now();
    ask.closedHow = how;
    delete ask.heldUntil;
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

/** Shown apart from what waits: looks done, he answered it, or «¿Sigue?». */
function lookDone(ask: StoredAsk): boolean {
  return !!ask.seemsDone || ask.answeredAt !== undefined || ask.staleSince !== undefined;
}

function isStale(ask: StoredAsk, now: number): boolean {
  if (lookDone(ask) || ask.heldUntil !== undefined) return false;
  if (ask.notBefore !== undefined && ask.notBefore > now) return false;
  return now - (ask.touchedAt ?? ask.at) >= STALE_MS;
}

/** Why it is shown apart, in words for its card. */
function apartReason(ask: StoredAsk): string | undefined {
  if (ask.seemsDone) return ask.seemsDone;
  if (ask.answeredAt !== undefined) {
    return `Le contestaste a Jarvis a las ${hourOf(ask.answeredAt)}: se cierra solo en 2 h si nadie lo reabre`;
  }
  if (ask.staleSince !== undefined) {
    const hours = Math.round((ask.staleSince - (ask.touchedAt ?? ask.at)) / HOUR);
    return `¿Sigue? Nadie lo movió en ${hours} h`;
  }
  return undefined;
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
  const apart = open ? apartReason(ask) : undefined;
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
    ...(open && ask.options?.length ? { options: ask.options } : {}),
    ...(open && ask.after ? { after: ask.after } : {}),
    ...(merge
      ? { mergeUrl: merge.url, mergeCommand: `gh pr merge ${merge.url} ${merge.args.join(' ')}` }
      : {}),
    ...(apart ? { seemsDone: apart } : {}),
    ...(ask.closedAt !== undefined ? { closedAt: ask.closedAt } : {}),
    ...(ask.closedHow ? { closedHow: ask.closedHow } : {}),
    ...(ask.closedAt !== undefined && ask.turnIds.length > 0 ? { turnIds: ask.turnIds } : {}),
  };
}
