import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { jarvisPrompt } from '../src/supervisors/jarvis.js';
import {
  JarvisKeeper,
  localDay,
  noteJarvisChoice,
  readJarvisState,
  updateJarvisState,
  wakePrompt,
} from '../src/supervisors/jarvisKeeper.js';
import { roleHash, SupervisionTeams, SupervisorRegistry } from '../src/supervisors/supervision.js';
import type { AgentState } from '../src/types.js';

let dir: string;
let stateFile: string;
let folder: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-'));
  stateFile = path.join(dir, 'estado.json');
  folder = path.join(dir, 'development');
  fs.mkdirSync(folder);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const CURRENT = roleHash(jarvisPrompt());

function addJarvis(store: AgentStateStore, id: number, over: Partial<AgentState> = {}) {
  const agent = createAgentState({
    id,
    sessionId: `s${id}`,
    projectDir: '/p',
    jsonlFile: `/p/s${id}.jsonl`,
    isExternal: false,
    cwd: folder,
    nickname: 'Jarvis',
    isWaiting: true,
    officeTerminal: true,
    supervision: { kind: 'all' },
    ...over,
  });
  store.set(id, agent);
  return agent;
}

function keeper(at: Date, over: { roles?: Record<string, string>; pending?: boolean } = {}) {
  const store = new AgentStateStore();
  const calls: string[] = [];
  const notes: string[] = [];
  let clock = at;
  const k = new JarvisKeeper({
    store,
    roleOf: (s) => over.roles?.[s],
    launch: async (where, prompt) => {
      calls.push(`launch ${path.basename(where)} ${prompt.slice(0, 20)}`);
      addJarvis(store, 50, { sessionId: 's50' });
      return 50;
    },
    close: (id) => {
      calls.push(`close ${id}`);
      store.delete(id);
      return true;
    },
    relaunch: async (id) => {
      calls.push(`relaunch ${id}`);
    },
    hasPending: () => over.pending ?? false,
    notebook: { add: (t) => notes.push(t) !== 0 },
    now: () => clock,
    stateFile,
  });
  return { k, store, calls, notes, setNow: (d: Date) => (clock = d) };
}

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);

describe('Jarvis keeper: state', () => {
  it('remembers its choice, folder and day', () => {
    expect(readJarvisState(stateFile)).toEqual({});
    noteJarvisChoice(true, folder, stateFile);
    updateJarvisState({ day: '2026-10-22' }, stateFile);
    noteJarvisChoice(false, undefined, stateFile);
    expect(readJarvisState(stateFile)).toEqual({ auto: false, folder, day: '2026-10-22' });
    expect(localDay(at(3, 9))).toBe('2026-10-03');
  });
});

describe('Jarvis keeper: the office starts', () => {
  it('gives an old role the new one, keeping the conversation', async () => {
    const { k, store, calls, notes } = keeper(at(22, 10), { roles: { s1: 'viejo' } });
    addJarvis(store, 1);
    await k.onOfficeStart();
    expect(calls).toEqual(['relaunch 1']);
    expect(notes[0]).toContain('rol nuevo');
    expect(readJarvisState(stateFile)).toMatchObject({ folder, day: '2026-10-22' });
  });

  it('leaves a Jarvis with the current role alone', async () => {
    const { k, store, calls } = keeper(at(22, 10), { roles: { s1: CURRENT } });
    addJarvis(store, 1);
    await k.onOfficeStart();
    expect(calls).toEqual([]);
  });

  it('starts it where it worked, unless you closed it', async () => {
    updateJarvisState({ folder }, stateFile);
    const first = keeper(at(22, 10));
    await first.k.onOfficeStart();
    expect(first.calls).toEqual([`launch development ${wakePrompt('arranque').slice(0, 20)}`]);

    noteJarvisChoice(false, undefined, stateFile);
    const second = keeper(at(22, 10));
    await second.k.onOfficeStart();
    expect(second.calls).toEqual([]);
  });

  it('never calls it where it never was', async () => {
    const { k, calls } = keeper(at(22, 10));
    await k.onOfficeStart();
    updateJarvisState({ folder: path.join(dir, 'borrada') }, stateFile);
    await k.onOfficeStart();
    expect(calls).toEqual([]);
  });
});

describe('Jarvis keeper: every morning', () => {
  it('starts the day with a clean conversation, once, when it is quiet', async () => {
    const { k, store, calls, notes, setNow } = keeper(at(22, 18), { roles: { s1: CURRENT } });
    addJarvis(store, 1);
    await k.tick(); // first sight: that conversation is today's
    expect(calls).toEqual([]);

    setNow(at(23, 5)); // too early
    await k.tick();
    expect(calls).toEqual([]);

    store.get(1)!.isWaiting = false; // working at 7: not now
    setNow(at(23, 7));
    await k.tick();
    expect(calls).toEqual([]);

    store.get(1)!.isWaiting = true;
    await k.tick();
    expect(calls).toEqual(['close 1', `launch development ${wakePrompt('manana').slice(0, 20)}`]);
    expect(notes.at(-1)).toContain('Día nuevo');
    expect(readJarvisState(stateFile).day).toBe('2026-10-23');

    await k.tick(); // the same day: nothing more
    expect(calls).toHaveLength(2);
  });

  it('waits while a permission is pending', async () => {
    updateJarvisState({ day: '2026-10-22' }, stateFile);
    const { k, store, calls } = keeper(at(23, 9), { pending: true });
    addJarvis(store, 1);
    await k.tick();
    expect(calls).toEqual([]);
  });

  it('with no Jarvis, starts one in the morning unless you closed it', async () => {
    updateJarvisState({ day: '2026-10-22', folder }, stateFile);
    const { k, calls } = keeper(at(23, 8));
    await k.tick();
    expect(calls).toHaveLength(1);

    updateJarvisState({ day: '2026-10-22', auto: false }, stateFile);
    const off = keeper(at(23, 8));
    await off.k.tick();
    expect(off.calls).toEqual([]);
  });
});

describe('which role a supervisor was launched with', () => {
  it('is kept per session, follows a background rebind and goes when forgotten', () => {
    const registry = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 't.json')), dir);
    registry.prepareLaunch('provisorio', { kind: 'all' });
    expect(registry.roleOf('provisorio')).toBe(CURRENT);
    registry.rebind('provisorio', 's9');
    expect(registry.roleOf('provisorio')).toBeUndefined();
    expect(registry.roleOf('s9')).toBe(CURRENT);
    // On disk: a new office (a restart) still knows it.
    const again = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 't.json')), dir);
    expect(again.roleOf('s9')).toBe(CURRENT);
    again.forget('s9');
    expect(again.roleOf('s9')).toBeUndefined();
  });
});
