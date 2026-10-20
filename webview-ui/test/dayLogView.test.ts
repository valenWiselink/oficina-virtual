import { describe, expect, it } from 'vitest';

import type { DayLogEntry } from '../../core/src/messages.js';
import { dayAchievements, dayLogRows } from '../src/history/dayLogView.js';

const at = (min: number) => new Date(2026, 9, 19, 10, min).getTime();
const entry = (min: number, over: Partial<DayLogEntry> = {}): DayLogEntry => ({
  at: at(min),
  agentId: 1,
  agent: 'Pagos',
  kind: 'permiso',
  text: 'Pidió permiso (Bash)',
  ...over,
});

describe('dayLogRows', () => {
  it('collapses a burst of the same thing and shows newest first', () => {
    const rows = dayLogRows([
      entry(12),
      entry(15),
      entry(20),
      entry(21, { kind: 'termino', text: 'Terminó su turno' }),
      entry(45),
    ]);
    expect(rows.map((r) => r.text)).toEqual([
      'Pidió permiso (Bash)',
      'Terminó su turno',
      '3 pedidos de permiso',
    ]);
    expect(rows[2]).toMatchObject({ from: at(12), to: at(20), count: 3 });
  });

  it('never merges two "te toca" or two agents', () => {
    const rows = dayLogRows([
      entry(1, { kind: 'tetoca', text: 'Te toca: A' }),
      entry(2, { kind: 'tetoca', text: 'Te toca: B' }),
      entry(3, { agentId: 2, agent: 'Front' }),
      entry(4),
    ]);
    expect(rows).toHaveLength(4);
  });
});

describe('dayAchievements', () => {
  it('counts results, and calm waits only with enough evidence', () => {
    const entries = [
      entry(1, { kind: 'tarea', text: 'Completó: A' }),
      entry(2, { kind: 'tarea', text: 'Completó: B' }),
      entry(3, { kind: 'tetoca', text: 'Te toca', prUrl: 'https://github.com/w/r/pull/1' }),
      ...[1, 2, 3].map((m) => entry(4 + m, { kind: 'respuesta', text: 'ok', waitedMs: 60_000 })),
    ];
    expect(dayAchievements(entries)).toEqual([
      '2 tareas completadas',
      '1 PR para revisar',
      'Nadie esperó más de 10 min un permiso',
    ]);
    expect(dayAchievements([entry(1, { kind: 'respuesta', text: 'ok', waitedMs: 1 })])).toEqual([]);
  });
});
