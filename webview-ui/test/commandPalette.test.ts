import { describe, expect, it, vi } from 'vitest';

import { groupByFolder, NO_FOLDER } from '../src/command/broadcast.js';
import {
  buildCommands,
  filterCommands,
  fold,
  fuzzyScore,
  type PaletteActions,
} from '../src/command/commands.js';
import { minutesLeft, missedSummary } from '../src/focus/focusMode.js';
import type { AgentView } from '../src/views/agentViews.js';

const view = (id: number, name: string, kind: AgentView['kind'], folder?: string) =>
  ({ id, name, kind, folder, statusText: 'Trabajando' }) as AgentView;

const actions = (): PaletteActions => ({
  onOpenAgent: vi.fn(),
  onNewAgent: vi.fn(),
  onSetView: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenSettings: vi.fn(),
  onBroadcast: vi.fn(),
  onToggleFocus: vi.fn(),
  onOpenPrs: vi.fn(),
});

describe('fuzzy filter', () => {
  it('ignores accents and case', () => {
    expect(fold('Acción ÑANDÚ')).toBe('accion nandu');
    expect(fuzzyScore('accion', 'Acción')).not.toBeNull();
  });

  it('matches letters in order, not out of order', () => {
    expect(fuzzyScore('hst', 'Historial')).not.toBeNull();
    expect(fuzzyScore('tsh', 'Historial')).toBeNull();
  });

  it('puts the closer match first', () => {
    const cmds = buildCommands([], actions(), false);
    expect(filterCommands(cmds, 'graf')[0].id).toBe('grafo');
    expect(filterCommands(cmds, 'ajus')[0].id).toBe('ajustes');
  });

  it('finds by keywords too (pull request → PRs)', () => {
    const cmds = buildCommands([], actions(), false);
    expect(filterCommands(cmds, 'pull').map((c) => c.id)).toContain('prs');
  });
});

describe('buildCommands', () => {
  it('lists whoever needs you first and runs the right action', () => {
    const a = actions();
    const cmds = buildCommands([view(1, 'Web', 'work'), view(2, 'Pagos', 'needs')], a, false);
    expect(cmds[0].label).toBe('Ir a Pagos');
    cmds[0].run();
    expect(a.onOpenAgent).toHaveBeenCalledWith(2);
  });

  it('offers to end focus mode while it runs', () => {
    const labels = buildCommands([], actions(), true).map((c) => c.label);
    expect(labels).toContain('Terminar modo foco');
  });
});

describe('groupByFolder', () => {
  it('groups by folder, sorted, with a group for no folder', () => {
    const groups = groupByFolder([
      view(1, 'B', 'work', 'web'),
      view(2, 'A', 'idle', 'web'),
      view(3, 'C', 'idle'),
    ]);
    expect(groups.map((g) => g.folder)).toEqual([NO_FOLDER, 'web']);
    expect(groups[1].agents.map((a) => a.name)).toEqual(['A', 'B']);
  });
});

describe('focus summary', () => {
  it('says what it kept quiet', () => {
    expect(missedSummary({ termino: 3, tetoca: 0 })).toBe('3 agentes terminaron mientras tanto.');
    expect(missedSummary({ termino: 1, tetoca: 2 })).toBe(
      '1 agente terminó y 2 te dejaron algo mientras tanto.',
    );
    expect(missedSummary({ termino: 0, tetoca: 0 })).toMatch(/No pasó nada/);
  });

  it('rounds the minutes left, never showing 0 while it runs', () => {
    expect(minutesLeft(25 * 60_000 + 14_000, 0)).toBe(25);
    expect(minutesLeft(10_000, 0)).toBe(1);
    expect(minutesLeft(0, 5)).toBe(0);
  });
});
