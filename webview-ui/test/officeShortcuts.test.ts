import { describe, expect, it } from 'vitest';

import { riskyReason } from '../src/permissions/riskyCommand.js';
import { terminalShortcut } from '../src/terminal/terminalShortcuts.js';
import { type AgentView, byUrgency, waitedFor } from '../src/views/agentViews.js';
import { officeKeyTarget } from '../src/views/officeKeys.js';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  type: 'keydown',
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const view = (id: number, over: Partial<AgentView> = {}): AgentView => ({
  id,
  canSetRun: false,
  supervisorNames: [],
  teamSize: 0,
  supervisedBy: [],
  name: `A${id}`,
  key: `k${id}`,
  palette: 0,
  hueShift: 0,
  kind: 'idle',
  statusText: '',
  subagents: [],
  tasks: [],
  hasTerminal: true,
  ...over,
});

describe('riskyReason', () => {
  it('marks pushes, merges, recursive deletes, drops and deploys', () => {
    expect(riskyReason('Bash', { command: 'git push origin develop' })).toBe(
      'sube cambios al remoto',
    );
    expect(riskyReason('Bash', { command: 'gh pr merge 812 --squash' })).toBe('mergea un PR');
    expect(riskyReason('Bash', { command: 'rm -rf node_modules' })).toBe(
      'borra en forma recursiva',
    );
    expect(riskyReason('PowerShell', { command: 'Remove-Item x -Recurse -Force' })).toBe(
      'borra en forma recursiva',
    );
    expect(riskyReason('Bash', { command: 'mysql -e "DROP TABLE users"' })).toBe('borra datos');
  });

  it('leaves everyday commands and non-shell tools alone', () => {
    expect(riskyReason('Bash', { command: 'git status' })).toBeNull();
    expect(riskyReason('Bash', { command: 'npm run build' })).toBeNull();
    expect(
      riskyReason('Edit', { file_path: 'deploy.md', old_string: 'a', new_string: 'b' }),
    ).toBeNull();
  });
});

describe('terminalShortcut', () => {
  it('takes Ctrl + / − / 0 and Ctrl+Shift+F, and nothing else', () => {
    expect(terminalShortcut(key('=', { ctrlKey: true }))).toBe('zoomIn');
    expect(terminalShortcut(key('-', { ctrlKey: true }))).toBe('zoomOut');
    expect(terminalShortcut(key('0', { ctrlKey: true }))).toBe('zoomReset');
    expect(terminalShortcut(key('F', { ctrlKey: true, shiftKey: true }))).toBe('search');
    // Plain Ctrl+F and Ctrl+C stay the program's.
    expect(terminalShortcut(key('f', { ctrlKey: true }))).toBeNull();
    expect(terminalShortcut(key('c', { ctrlKey: true }))).toBeNull();
    expect(terminalShortcut({ ...key('=', { ctrlKey: true }), type: 'keyup' })).toBeNull();
  });
});

describe('waiting order', () => {
  it('puts what blocks first, then the longest wait', () => {
    const views = [
      view(1, { kind: 'needs', waitingSince: 100 }),
      view(2, { kind: 'needs', blocking: true, waitingSince: 500 }),
      view(3, { kind: 'needs', waitingSince: 50 }),
    ];
    expect([...views].sort(byUrgency).map((v) => v.id)).toEqual([2, 3, 1]);
  });

  it('says how long in plain words', () => {
    expect(waitedFor(0, 30_000)).toBe('recién');
    expect(waitedFor(0, 12 * 60_000)).toBe('hace 12 min');
    expect(waitedFor(0, 75 * 60_000)).toBe('hace 1 h 15 min');
  });
});

describe('officeKeyTarget', () => {
  const views = [
    view(3),
    view(1, { kind: 'needs', waitingSince: 9 }),
    view(2, { kind: 'needs', waitingSince: 5 }),
  ];
  it('Alt+N opens the longest wait; Alt+digit the agent in board order', () => {
    expect(officeKeyTarget(key('n', { altKey: true }), views)).toBe(2);
    expect(officeKeyTarget(key('1', { altKey: true }), views)).toBe(1);
    expect(officeKeyTarget(key('3', { altKey: true }), views)).toBe(3);
    expect(officeKeyTarget(key('9', { altKey: true }), views)).toBeNull();
    expect(officeKeyTarget(key('n'), views)).toBeNull();
  });
});
