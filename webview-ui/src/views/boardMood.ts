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

const EMPTY_LINES: Record<BoardColumnId, readonly string[]> = {
  needs: [
    'Nadie te espera. Buen momento para un mate.',
    'Todo en orden por acá.',
    'Ni un permiso pendiente.',
    'Tus agentes se arreglan solos.',
  ],
  work: ['Todos en el recreo.', 'Nadie está trabajando ahora.', 'Silencio en la oficina.'],
  done: ['Nada para revisar.', 'Nada recién terminado.', 'Sin novedades que mirar.'],
  idle: ['Todos tienen algo que hacer.', 'Nadie sin tarea.', 'Ni un agente aburrido.'],
};

/** The line for an empty column on a given day (days since the epoch). */
export function emptyLine(column: BoardColumnId, day: number): string {
  const lines = EMPTY_LINES[column];
  return lines[((day % lines.length) + lines.length) % lines.length];
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

/** A line for special days and moments, or undefined on a plain one. */
export function dayNote(date: Date): string | undefined {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (DATED[md]) return DATED[md];
  if (isProgrammersDay(date)) return '¡Feliz día del programador!';
  const hour = date.getHours();
  if (hour >= 23 || hour < 5) return 'ya es tarde: no te quedes hasta cualquier hora';
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  if (tomorrow.getDate() === 1) return 'fin de mes: ojo con los cierres';
  if (date.getDay() === 5) return '¡viernes! Mejor no deployar a prod';
  if (date.getDay() === 1 && hour < 12) return 'lunes: arrancamos';
  return undefined;
}
