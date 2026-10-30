import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { PERMISSION_TIMER_DELAY_MS } from '../src/constants.js';
import { screenAsks } from '../src/screenAsks.js';
import { setPermissionScreenReader, startPermissionTimer } from '../src/timerManager.js';
import type { AgentState } from '../src/types.js';

/** Jarvis's terminal while a 45 s shell command ran, as it was on screen
 *  when the chat said "Te hizo una pregunta con opciones" (2026-10-30). */
const RUNNING_COMMAND = [
  '✻ Cogitated for 5s · done 13:50',
  '',
  '❯ listo',
  '',
  '  (Te escribo desde el chat de la oficina: respondé',
  '  corto, como en un chat; sin títulos ni tablas salvo',
  '  que hagan falta.)',
  '',
  '● Running 1 shell command · 45s…',
  '  ⎿ $ cd /f/proyectos/Wiselink/development/.worktrees',
  '    && ls -d *6416* 2>/dev/null; ls',
  '    */migrations/*6416* */scripts/migrations/*6416*',
  '    2>/dev/null; grep -ril "CHECKIN_ATTENDER_TOKEN"',
  '    --include=*.sql . 2>/dev/null | grep -v rollback |',
  '    head (44s · 2 lines)',
  '    (ctrl+b to run in background)',
  '',
  '* Ajustando… (48s · ↓ 276 tokens)',
  '',
  '──────────────────────────────── oficina-jarvis-dcc0 ─',
  '❯ ',
  '──────────────────────────────────────────────────────',
  '  ⏵⏵ auto mode on (shift+tab to cycle) · ← 3 agents ·',
];

const PERMISSION_PROMPT = [
  '● Bash(rm -rf build)',
  '',
  '────────────────────────────────────────────────────────',
  ' Bash command',
  '',
  '   rm -rf build',
  '   Borra la carpeta build',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  "   2. Yes, and don't ask again for rm commands in F:\\proyectos",
  '   3. No, and tell Claude what to do differently (esc)',
];

const QUESTION = [
  '● AskUserQuestion',
  '',
  ' ☐ Base',
  '',
  ' ¿Contra qué base corro la migración?',
  '',
  ' ❯ 1. dev',
  '      La de desarrollo',
  '   2. prod',
  '      La de producción',
  '   3. Type something.',
  '',
  ' Enter to select · ↑/↓ to navigate · Esc to cancel',
];

describe('screenAsks', () => {
  it('a running shell command asks nothing', () => {
    expect(screenAsks(RUNNING_COMMAND)).toBe(false);
  });

  it('a permission prompt and a question with options do ask', () => {
    expect(screenAsks(PERMISSION_PROMPT)).toBe(true);
    expect(screenAsks(QUESTION)).toBe(true);
  });

  it('a message that starts with a number is not a menu', () => {
    expect(screenAsks(['❯ 1. hacé el deploy', '', '● Listo.', '', '❯ '])).toBe(false);
  });
});

describe('the no-hooks permission guess reads the terminal', () => {
  afterEach(() => {
    setPermissionScreenReader(() => undefined);
    vi.useRealTimers();
  });

  function busyBash(): { store: AgentStateStore; sent: Record<string, unknown>[] } {
    const store = new AgentStateStore();
    store.set(1, {
      activeToolIds: new Set(['t1']),
      activeToolNames: new Map([['t1', 'Bash']]),
      activeSubagentToolNames: new Map(),
    } as unknown as AgentState);
    const sent: Record<string, unknown>[] = [];
    store.on('broadcast', (m) => sent.push(m));
    return { store, sent };
  }

  it('says nothing while the screen shows the command running, and asks once a prompt shows', () => {
    vi.useFakeTimers();
    let screen = RUNNING_COMMAND;
    setPermissionScreenReader(() => screen);
    const { store, sent } = busyBash();
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    startPermissionTimer(1, store, timers, new Set());
    vi.advanceTimersByTime(PERMISSION_TIMER_DELAY_MS * 3 + 1);
    expect(sent).toEqual([]);
    expect(timers.size).toBe(1); // still watching while the tool runs

    screen = PERMISSION_PROMPT;
    vi.advanceTimersByTime(PERMISSION_TIMER_DELAY_MS + 1);
    expect(sent.map((m) => m.type)).toEqual(['agentToolPermission']);
    expect(store.get(1)!.permissionSent).toBe(true);
  });

  it('still guesses for a session without an office terminal', () => {
    vi.useFakeTimers();
    const { store, sent } = busyBash();
    startPermissionTimer(1, store, new Map(), new Set());
    vi.advanceTimersByTime(PERMISSION_TIMER_DELAY_MS + 1);
    expect(sent.map((m) => m.type)).toEqual(['agentToolPermission']);
  });
});
