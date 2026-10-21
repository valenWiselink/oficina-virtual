/**
 * What the office's little moments say (OfficeCheers): a merge that knows
 * how many came before it today and who did the last one, a "Terminaron
 * todos" that knows the hour, and an evening summary that says "Más que
 * ayer" only when it is true. Never the same line twice in a row (`last`),
 * never a count that is not in the history, never "less than". Pure, so it
 * is tested without a DOM.
 */

/** The first line of `lines` that is not `last` (all equal: the first). */
export function fresh(lines: readonly string[], last: string | undefined): string {
  return lines.find((l) => l !== last) ?? lines[0];
}

export interface MergeMoment {
  /** PRs merged today, this one included (distinct, from the history). */
  count: number;
  /** Who this one is from, and who did the previous one today. */
  agent?: string;
  previousAgent?: string;
}

/** A merge's title: «¡Primer merge del día!», «¡Otro adentro! · van 3 hoy»,
 *  «Van 5. Día redondo», «Langostino no para». */
export function mergeTitle(m: MergeMoment, last?: string): string {
  const n = Math.max(1, m.count);
  if (n === 1) return '¡Primer merge del día!';
  if (n === 5) return fresh(['Van 5. Día redondo', '¡Cinco! Día redondo'], last);
  if (m.agent && m.agent === m.previousAgent) {
    return fresh([`${m.agent} no para`, `${m.agent} sigue de racha`], last);
  }
  if (n < 5) return fresh([`¡Otro adentro! · van ${n} hoy`, `¡Adentro! · van ${n} hoy`], last);
  return fresh([`¡Otro más! · van ${n} hoy`, `Van ${n} hoy. Qué día`], last);
}

const ALL_DONE: Record<'day' | 'lunch' | 'closing', readonly string[]> = {
  day: [
    'Nadie está trabajando ni te espera. Andá a estirar las piernas.',
    'Nadie trabaja ni te espera: buen momento para un mate.',
  ],
  lunch: ['Todos quietos. ¿Almorzaste?', 'Nadie trabaja ni te espera. ¿Ya comiste?'],
  closing: ['Buen momento para cerrar el día.', 'Todos quietos: buen momento para cerrar el día.'],
};

/** Hours of the lunch line, and from when the day can close. */
export const LUNCH_FROM = 12;
export const LUNCH_UNTIL = 15;
export const CLOSING_FROM = 17;

/** "Terminaron todos", worded for the hour. */
export function allDoneText(hour: number, last?: string): string {
  const period =
    hour >= CLOSING_FROM ? 'closing' : hour >= LUNCH_FROM && hour < LUNCH_UNTIL ? 'lunch' : 'day';
  return fresh(ALL_DONE[period], last);
}

/** «Más que ayer.» (or «… que el viernes.») only when today's finished work
 *  beats the last worked day's; otherwise nothing — never "menos". */
export function moreThanBefore(
  today: number,
  before: { count: number; label: string } | undefined,
): string | undefined {
  if (!before || before.count <= 0 || today <= before.count) return undefined;
  return `Más que ${before.label}.`;
}

/** A merge in context, from today's history: how many PRs were merged
 *  (this one included, even before its line arrives) and who did the one
 *  before. Names come from the history, the view's only as a fallback. */
export function mergeMoment(
  entries: ReadonlyArray<{ kind: string; prUrl?: string; agent: string }>,
  url: string,
  viewName?: string,
): MergeMoment {
  const merged = entries.filter((e) => e.kind === 'mergeado' && e.prUrl);
  const urls = new Set(merged.map((e) => e.prUrl));
  urls.add(url);
  const previous = [...merged].reverse().find((e) => e.prUrl !== url);
  const own = merged.find((e) => e.prUrl === url);
  return {
    count: urls.size,
    agent: named(own?.agent) ?? viewName,
    previousAgent: named(previous?.agent),
  };
}

/** The server's name for a line nobody owns (dayLog.nameOf) is no name. */
const named = (agent: string | undefined) => (agent === 'Un agente' ? undefined : agent);

/** The evening summary (the day's, Friday's week) shows from this hour. */
export const SUMMARY_HOUR = 18;
