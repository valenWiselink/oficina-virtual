/**
 * «Ahora» (chosen 2026-11-06): of everything that waits on Valentín, one goes
 * first, and it says why. Points for what has a deadline coming, what is due
 * now («a las 23» at 22:40), what holds agents back, what goes to production,
 * a question of Jarvis's, and how long it has waited. What is for later
 * («a las 23» at 14:00, «Más tarde») stays apart until shortly before.
 */
import { type AskTimes, hourText, type MeetingTime, timesOf } from './nowTime.js';

export interface NowAsk {
  id: string;
  from: string;
  text: string;
  at: number;
  command?: string;
  due?: number;
  notBefore?: number;
  why?: string;
  ifNot?: string;
  question?: boolean;
  mergeUrl?: string;
}

export interface NowAgent {
  name: string;
  /** Working on its own: an ask that names it does not hold it back. */
  busy: boolean;
}

export interface NowContext {
  now: number;
  agents: readonly NowAgent[];
  meetings?: readonly MeetingTime[];
}

export interface Ranked<T extends NowAsk = NowAsk> {
  ask: T;
  score: number;
  /** Why it is where it is, most important first («Vence a las 14:45»). */
  reasons: string[];
  times: AskTimes;
  /** The agents it holds back, by name. */
  blocks: string[];
}

export interface NowQueue<T extends NowAsk = NowAsk> {
  first?: Ranked<T>;
  next: Ranked<T>[];
  /** Not yet: «a las 23», put off. Soonest first. */
  later: Ranked<T>[];
}

const MINUTE = 60_000;
/** A start this close comes forward. */
export const SOON_MS = 30 * MINUTE;
const PROD = /\b(?:main|master|producci[oó]n|prod)\b/i;
const ANSWER =
  /^(?:decirme|decidir|confirmar|confirmarme|autorizar|autorizarme|elegir|contestar|responder)\b/i;

/** Jarvis waits for a sí or a no (or a choice): answered in one tap. */
export function asksAnswer(ask: NowAsk): boolean {
  return ask.from === 'Jarvis' && (ask.question === true || ANSWER.test(ask.text.trim()));
}

/** «a», «a y b», «a, b y c» */
function names(list: readonly string[]): string {
  const quoted = list.map((n) => `«${n}»`);
  return quoted.length <= 1
    ? quoted.join('')
    : `${quoted.slice(0, -1).join(', ')} y ${quoted.at(-1)}`;
}

function agentsNamed(ask: NowAsk, agents: readonly NowAgent[]): string[] {
  const words = `${ask.text} ${ask.why ?? ''}`.toLowerCase();
  const said = new Set([...words.matchAll(/«([^»]+)»/g)].map((m) => m[1].trim()));
  return agents.filter((a) => !a.busy && said.has(a.name.toLowerCase())).map((a) => a.name);
}

interface Part {
  points: number;
  reason?: string;
}

function timeParts(times: AskTimes, now: number): Part[] {
  const parts: Part[] = [];
  if (times.notBefore !== undefined && times.notBefore <= now + SOON_MS) {
    parts.push({
      points: 700,
      reason:
        times.notBefore <= now
          ? `Era para las ${hourText(times.notBefore)}`
          : `Es a las ${hourText(times.notBefore)}`,
    });
  }
  if (times.due !== undefined) {
    const left = times.due - now;
    const at = hourText(times.due);
    // Long past: still pending, but the hurry is over.
    if (left < -2 * 60 * MINUTE) parts.push({ points: 0, reason: `Venció a las ${at}` });
    else if (left < 0) parts.push({ points: 1000, reason: `Venció a las ${at}` });
    else if (left <= 60 * MINUTE) {
      parts.push({
        points: 800 + (60 - left / MINUTE) * 3,
        reason: `Vence a las ${at}, en ${Math.max(1, Math.round(left / MINUTE))} min`,
      });
    } else if (left <= 3 * 60 * MINUTE) parts.push({ points: 400, reason: `Vence a las ${at}` });
    else parts.push({ points: 100, reason: `Para antes de las ${at}` });
  }
  return parts;
}

function waitedText(minutes: number): string {
  return minutes < 120
    ? `Espera hace ${Math.round(minutes)} min`
    : `Espera hace ${Math.round(minutes / 60)} h`;
}

export function rankAsk<T extends NowAsk>(ask: T, ctx: NowContext): Ranked<T> {
  const read = timesOf(`${ask.text} ${ask.command ?? ''}`, ask.at, ctx.meetings);
  const times: AskTimes = {
    due: ask.due ?? read.due,
    notBefore: ask.notBefore ?? read.notBefore,
  };
  const blocks = agentsNamed(ask, ctx.agents);
  const parts = timeParts(times, ctx.now);
  if (blocks.length > 0) {
    parts.push({ points: 150 * Math.min(3, blocks.length), reason: `Frena a ${names(blocks)}` });
  }
  if (PROD.test(`${ask.text} ${ask.command ?? ''}`))
    parts.push({ points: 120, reason: 'Va a producción' });
  if (asksAnswer(ask)) parts.push({ points: 60, reason: 'Jarvis espera tu respuesta' });
  const waited = Math.max(0, (ctx.now - ask.at) / MINUTE);
  parts.push({
    points: Math.min(180, waited / 2),
    reason: waited >= 60 ? waitedText(waited) : undefined,
  });
  const ordered = [...parts].sort((a, b) => b.points - a.points);
  return {
    ask,
    score: parts.reduce((sum, p) => sum + p.points, 0),
    reasons: ordered.flatMap((p) => (p.reason ? [p.reason] : [])).slice(0, 3),
    times,
    blocks,
  };
}

/** Is it for later: a start still more than SOON_MS away. */
export function isLater(r: Ranked, now: number): boolean {
  return r.times.notBefore !== undefined && r.times.notBefore > now + SOON_MS;
}

/** What waits on him, in order, and what is for later. */
export function nowQueue<T extends NowAsk>(asks: readonly T[], ctx: NowContext): NowQueue<T> {
  const ranked = asks.map((a) => rankAsk(a, ctx));
  const later = ranked
    .filter((r) => isLater(r, ctx.now))
    .sort((a, b) => (a.times.notBefore ?? 0) - (b.times.notBefore ?? 0));
  const active = ranked
    .filter((r) => !isLater(r, ctx.now))
    .sort((a, b) => b.score - a.score || a.ask.at - b.ask.at);
  return { first: active[0], next: active.slice(1), later };
}
