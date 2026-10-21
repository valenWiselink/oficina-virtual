/**
 * The board's small talk: a greeting for the hour with what the office is up
 * to, and a line for each empty column instead of a flat "nobody". Pure, so
 * it is tested without a DOM. Empty lines change once a day, not per render.
 */

export type BoardColumnId = 'needs' | 'work' | 'done' | 'idle';

/** "Buen día" and its Material Symbols icon, by hour. */
export function greeting(hour: number): { text: string; icon: string } {
  if (hour >= 6 && hour < 12) return { text: 'Buen día', icon: 'wb_sunny' };
  if (hour >= 12 && hour < 20) return { text: 'Buenas tardes', icon: 'wb_twilight' };
  return { text: 'Buenas noches', icon: 'bedtime' };
}

/** "2 trabajando · nadie te espera": what matters first, always the wait. */
export function officeSummary(counts: Record<BoardColumnId, number>): string {
  const total = counts.needs + counts.work + counts.done + counts.idle;
  if (total === 0) return 'la oficina está vacía: sumá un agente cuando quieras';
  const parts: string[] = [];
  if (counts.work > 0) parts.push(`${counts.work} trabajando`);
  if (counts.done > 0) parts.push(`${counts.done} ${counts.done === 1 ? 'terminó' : 'terminaron'}`);
  parts.push(
    counts.needs === 0
      ? 'nadie te espera'
      : counts.needs === 1
        ? '1 te espera'
        : `${counts.needs} te esperan`,
  );
  return parts.join(' · ');
}

/** The day in four parts, for the empty-column lines. */
export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 19) return 'afternoon';
  return 'evening';
}

/** Lines for any hour, plus a few for each part of the day: about eight to
 *  pick from at any time. Never about speed or how many you handled. */
const EMPTY_LINES: Record<
  BoardColumnId,
  { any: readonly string[] } & Record<DayPart, readonly string[]>
> = {
  needs: {
    any: [
      'Nadie te espera.',
      'Todo en orden por acá.',
      'Ni un permiso pendiente.',
      'Tus agentes se arreglan solos.',
      'Nada que destrabar.',
    ],
    morning: [
      'Nadie te espera. Buen momento para un mate.',
      'Arranque tranquilo: nadie te espera.',
      'Ni un pedido todavía.',
    ],
    midday: [
      'Nadie te espera: andá a comer tranquilo.',
      'Todo en orden. Buen momento para almorzar.',
      'Sin pedidos: la oficina se arregla sola un rato.',
    ],
    afternoon: [
      'Nadie te espera. Buen momento para un café.',
      'Todo en orden: seguí con lo tuyo.',
      'Ni un pedido por ahora.',
    ],
    evening: [
      'Nadie te espera. Podés ir cerrando.',
      'Todo en orden para irte.',
      'Ni un pendiente: buen cierre.',
    ],
  },
  work: {
    any: [
      'Todos en el recreo.',
      'Nadie está trabajando ahora.',
      'Silencio en la oficina.',
      'Teclados quietos.',
      'Nadie con las manos en la masa.',
    ],
    morning: [
      'Todavía nadie arrancó.',
      'La oficina se está despertando.',
      'Esperando el primer pedido del día.',
    ],
    midday: ['Pausa del mediodía.', 'Todos en la hora del almuerzo.', 'Pausa general.'],
    afternoon: ['Un rato de calma.', 'Tranquilo por acá.', 'Nadie trabajando en este momento.'],
    evening: [
      'La oficina ya bajó la persiana.',
      'Todos descansando.',
      'Nadie trabajando a esta hora.',
    ],
  },
  done: {
    any: [
      'Nada para revisar.',
      'Nada recién terminado.',
      'Sin novedades que mirar.',
      'Nada nuevo para leer.',
      'Todo leído.',
    ],
    morning: ['Nada esperando que lo leas.', 'Bandeja vacía.', 'Nada para mirar por ahora.'],
    midday: [
      'Nada para revisar antes de comer.',
      'Bandeja vacía al mediodía.',
      'Sin respuestas por leer.',
    ],
    afternoon: ['Nada para revisar por ahora.', 'Bandeja vacía.', 'Sin respuestas nuevas.'],
    evening: [
      'Nada para revisar antes de irte.',
      'Bandeja vacía para cerrar.',
      'Todo leído por hoy.',
    ],
  },
  idle: {
    any: [
      'Todos tienen algo que hacer.',
      'Nadie sin tarea.',
      'Ni un agente aburrido.',
      'Todos ocupados en algo.',
      'Nadie mirando el techo.',
    ],
    morning: ['Todos arrancaron con algo.', 'Cada uno con lo suyo.', 'Nadie de brazos cruzados.'],
    midday: [
      'Nadie sin tarea, ni al mediodía.',
      'Cada uno con lo suyo.',
      'Todos con algo entre manos.',
    ],
    afternoon: [
      'Cada uno con lo suyo.',
      'Todos con algo entre manos.',
      'Nadie de brazos cruzados.',
    ],
    evening: ['Todos con algo, todavía.', 'Cada uno con lo suyo.', 'Nadie de brazos cruzados.'],
  },
};

const PARTS: readonly DayPart[] = ['morning', 'midday', 'afternoon', 'evening'];

/** The line for an empty column on a given day (days since the epoch) and
 *  hour: the same all morning, another at noon, and so on — never per render.
 *  Each part of the day starts 3 lines further on, so no two parts of one
 *  day share a line. */
export function emptyLine(column: BoardColumnId, day: number, hour = 9): string {
  const set = EMPTY_LINES[column];
  const part = dayPart(hour);
  const lines = [...set[part], ...set.any];
  const at = day + PARTS.indexOf(part) * 3;
  return lines[((at % lines.length) + lines.length) % lines.length];
}

/** Days since the epoch in local time, for emptyLine. */
export function localDay(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** Fixed-date days (month-day), Argentine holidays first. Movable holidays
 *  are left out: a wrong "es feriado" is worse than none. */
const DATED: Record<string, string> = {
  '01-01': '¡Feliz año nuevo!',
  '03-24': 'hoy es feriado: Día de la Memoria',
  '04-02': 'hoy es feriado: Día de Malvinas',
  '05-01': 'día del trabajador: hoy se descansa',
  '05-25': '¡Feliz 25 de Mayo! ¿Hay locro?',
  '06-20': 'hoy es feriado: Día de la Bandera',
  '07-09': '¡Feliz Día de la Independencia!',
  '12-08': 'hoy es feriado',
  '12-24': 'nochebuena: cerrá temprano',
  '12-25': '¡Feliz Navidad!',
  '12-31': 'último día del año: que no se rompa nada',
};

/** Programmers' Day: the 256th day of the year. */
function isProgrammersDay(date: Date): boolean {
  const start = new Date(date.getFullYear(), 0, 1);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1 === 256;
}

/** What makes a day (and hour) worth a word, by kind, so the greeting can
 *  weigh each against the rest (greetingRule.ts). */
export interface DayMoments {
  /** A dated day: a holiday, New Year, Programmers' Day. */
  special?: string;
  /** Past 23 h. */
  late?: string;
  /** Month end or Friday. */
  plain?: string;
  /** Monday morning ("lunes: arrancamos"). */
  monday: boolean;
}

export function dayMoments(date: Date): DayMoments {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const hour = date.getHours();
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return {
    special: DATED[md] ?? (isProgrammersDay(date) ? '¡Feliz día del programador!' : undefined),
    late: hour >= 23 || hour < 5 ? 'ya es tarde: no te quedes hasta cualquier hora' : undefined,
    plain:
      tomorrow.getDate() === 1
        ? 'fin de mes: ojo con los cierres'
        : date.getDay() === 5
          ? '¡viernes! Mejor no deployar a prod'
          : undefined,
    monday: date.getDay() === 1 && hour < 12,
  };
}

export const MONDAY_NOTE = 'lunes: arrancamos';

/** A line for special days and moments, or undefined on a plain one. */
export function dayNote(date: Date): string | undefined {
  const m = dayMoments(date);
  return m.special ?? m.late ?? m.plain ?? (m.monday ? MONDAY_NOTE : undefined);
}
