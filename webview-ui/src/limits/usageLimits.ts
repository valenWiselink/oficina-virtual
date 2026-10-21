import type { RateWindow, UsageLimits } from '../../../core/src/messages.js';

/**
 * How the plan's usage limits read on screen: the 5-hour session and the
 * week, each as a percentage, a level (calm, amber, red) and when it resets.
 * The numbers come from Claude Code's status line (server/src/usageLimits).
 * Pure, so it is tested without a DOM.
 */

export type { UsageLimits };

export type LimitLevel = 'ok' | 'warn' | 'danger';

/** Amber from here: worth knowing before starting something long. */
export const LIMIT_WARN_AT = 80;
/** Red from here: the next long turn may hit the wall. */
export const LIMIT_DANGER_AT = 95;

export function limitLevel(pct: number): LimitLevel {
  if (pct >= LIMIT_DANGER_AT) return 'danger';
  if (pct >= LIMIT_WARN_AT) return 'warn';
  return 'ok';
}

/** Theme classes per level (index.css tokens, so dark mode follows). */
export const LIMIT_FILL: Record<LimitLevel, string> = {
  ok: 'bg-text-muted',
  warn: 'bg-status-permission',
  danger: 'bg-danger',
};
export const LIMIT_TEXT: Record<LimitLevel, string> = {
  ok: 'text-text',
  warn: 'text-status-permission-text',
  danger: 'text-danger',
};

/** One window as shown: null percentage = no data. */
export interface WindowView {
  label: string;
  pct: number | null;
  level: LimitLevel;
  /** "se reinicia en 2 h 15 min (a las 18:40)", "se reinició a las 18:40". */
  reset: string | null;
}

const clock = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function dayNumber(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / (24 * HOUR));
}

/** "2 h 15 min", "3 h", "25 min", "menos de un minuto". */
export function formatSpan(ms: number): string {
  const mins = Math.ceil(ms / MINUTE);
  if (mins <= 1) return 'menos de un minuto';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * When a window resets, from now: within the day "se reinicia en 2 h 15 min
 * (a las 18:40)", later "se reinicia mañana a las 09:00" or "el jueves a
 * las 09:00"; once past, "se reinició a las 18:40".
 */
export function formatReset(resetsAtSec: number, now: number): string {
  const at = new Date(resetsAtSec * 1000);
  const time = clock.format(at);
  const ms = at.getTime() - now;
  if (ms <= 0) return `se reinició a las ${time}`;
  if (ms < 12 * HOUR) return `se reinicia en ${formatSpan(ms)} (a las ${time})`;
  const days = dayNumber(at) - dayNumber(new Date(now));
  if (days === 0) return `se reinicia hoy a las ${time}`;
  if (days === 1) return `se reinicia mañana a las ${time}`;
  return `se reinicia el ${weekday.format(at)} a las ${time}`;
}

/** A window as the meter shows it. A window already past its reset reads
 *  0 %: Claude Code starts a fresh one with the next request. */
export function windowView(label: string, w: RateWindow | undefined, now: number): WindowView {
  if (!w) return { label, pct: null, level: 'ok', reset: null };
  const reset = formatReset(w.resetsAt, now);
  if (w.resetsAt * 1000 <= now) return { label, pct: 0, level: 'ok', reset };
  const pct = Math.min(100, Math.max(0, Math.round(w.usedPercentage)));
  return { label, pct, level: limitLevel(pct), reset };
}

/** Both windows, session first. */
export function limitViews(msg: UsageLimits | null, now: number): [WindowView, WindowView] {
  return [windowView('Sesión (5 h)', msg?.fiveHour, now), windowView('Semana', msg?.sevenDay, now)];
}

/** The window closest to its limit, for the one-number narrow version. */
export function worstView(views: readonly WindowView[]): WindowView | null {
  let worst: WindowView | null = null;
  for (const v of views) {
    if (v.pct !== null && (worst === null || v.pct > (worst.pct ?? -1))) worst = v;
  }
  return worst;
}

/** "actualizado recién", "actualizado hace 12 min", "… hace 3 h". */
export function formatObserved(observedAt: number | undefined, now: number): string | null {
  if (observedAt === undefined) return null;
  const ms = Math.max(0, now - observedAt);
  if (ms < 2 * MINUTE) return 'actualizado recién';
  if (ms < HOUR) return `actualizado hace ${Math.floor(ms / MINUTE)} min`;
  if (ms < 48 * HOUR) return `actualizado hace ${Math.floor(ms / HOUR)} h`;
  return `actualizado hace ${Math.floor(ms / (24 * HOUR))} días`;
}

/** "Sesión (5 h): 23 % · se reinicia en …" / "Semana: sin dato". */
export function windowLine(v: WindowView): string {
  if (v.pct === null) return `${v.label}: sin dato`;
  return `${v.label}: ${v.pct} % · ${v.reset}`;
}

/** The tooltip: one line per window, then how fresh the numbers are. */
export function limitsTitle(msg: UsageLimits | null, now: number): string {
  if (!msg || msg.setup !== 'ours') return 'Tus límites de Claude: sin dato';
  const views = limitViews(msg, now);
  if (views.every((v) => v.pct === null)) {
    return 'Tus límites de Claude: sin dato todavía. Llegan con la próxima respuesta de un agente.';
  }
  const observed = formatObserved(msg.observedAt, now);
  return [...views.map(windowLine), observed && `(${observed})`].filter(Boolean).join('\n');
}

/** The newest usageLimits message, or null for any other message. */
export function readLimitsMessage(msg: {
  type?: unknown;
  [key: string]: unknown;
}): UsageLimits | null {
  if (msg.type !== 'usageLimits') return null;
  const m = msg as Partial<UsageLimits>;
  return typeof m.setup === 'string' ? (m as UsageLimits) : null;
}
