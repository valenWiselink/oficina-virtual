import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { PendingPermission } from '../src/permissionBroker.js';
import {
  LAUNCHED_ALIVE_MAX,
  type SupervisionScope,
  SupervisionTeams,
  supervisorPrompt,
  SupervisorRegistry,
} from '../src/supervisors/supervision.js';
import { applySupervisionTeam } from '../src/supervisors/supervisionMessages.js';
import { launchFolder, type LaunchPlaces, teamState } from '../src/supervisors/supervisorLaunch.js';
import { SupervisorRelay } from '../src/supervisors/supervisorRelay.js';
import { type AgentLaunch, SupervisorTools } from '../src/supervisors/supervisorTools.js';
import type { AgentState } from '../src/types.js';

let root: string;
let dirs: { dev: string; webapp: string; otherDev: string; ajena: string };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanzar-'));
  dirs = {
    dev: path.join(root, 'proyectos', 'development'),
    webapp: path.join(root, 'proyectos', 'webapp'),
    otherDev: path.join(root, 'viejo', 'development'),
    ajena: path.join(root, 'ajena'),
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const workspace: SupervisionScope = { kind: 'workspace', workspaceId: 'w', name: 'Wiselink' };

describe('launchFolder', () => {
  const places = (over: Partial<LaunchPlaces> = {}): LaunchPlaces => ({
    scope: workspace,
    workspaceFolders: ['development', 'webapp'],
    teamFolders: [dirs.dev],
    knownFolders: [dirs.webapp, dirs.ajena],
    ...over,
  });

  it('takes a full path whose folder lands in the workspace', () => {
    expect(launchFolder(dirs.webapp, places())).toEqual({ ok: true, path: dirs.webapp });
    expect(launchFolder(`${dirs.dev}\\`, places())).toEqual({ ok: true, path: dirs.dev });
  });

  it('resolves a folder name against the folders the office knows', () => {
    expect(launchFolder('webapp', places())).toEqual({ ok: true, path: dirs.webapp });
    expect(launchFolder('«WebApp»', places())).toEqual({ ok: true, path: dirs.webapp });
  });

  it('asks for the full path when a name is ambiguous or unknown', () => {
    const two = launchFolder('development', places({ knownFolders: [dirs.otherDev] }));
    expect(two).toMatchObject({ ok: false });
    expect(!two.ok && two.reason).toContain('Hay más de una carpeta «development»');
    const none = launchFolder('development', places({ teamFolders: [], knownFolders: [] }));
    expect(!none.ok && none.reason).toContain('No conozco una carpeta «development»');
  });

  it('refuses what would land outside the workspace, saying where it can', () => {
    const out = launchFolder(dirs.ajena, places());
    expect(out.ok).toBe(false);
    expect(!out.ok && out.reason).toContain(
      '«ajena» no es una carpeta de tu espacio «Wiselink» ni de tu equipo',
    );
    expect(!out.ok && out.reason).toContain(`Podés abrir en: ${dirs.dev}`);
    expect(!out.ok && out.reason).toContain('carpetas de tu espacio: development, webapp');
    expect(launchFolder('ajena', places()).ok).toBe(false);
  });

  it('refuses a folder that does not exist, and an empty one', () => {
    const gone = launchFolder(path.join(root, 'proyectos', 'nada'), places());
    expect(!gone.ok && gone.reason).toContain('No existe la carpeta');
    expect(launchFolder('  ', places()).ok).toBe(false);
  });

  it('in a workspace made by hand (no folders) takes where it or its team works', () => {
    for (const workspaceFolders of [undefined, []]) {
      const byHand = places({ workspaceFolders });
      expect(launchFolder(dirs.dev, byHand)).toEqual({ ok: true, path: dirs.dev });
      expect(launchFolder('development', byHand)).toEqual({ ok: true, path: dirs.dev });
      const out = launchFolder(dirs.webapp, byHand);
      expect(!out.ok && out.reason).toContain('no es una carpeta de tu espacio');
    }
  });

  it('keeps a hand-picked team to its own folders, and "all" to the office’s', () => {
    const agents = places({ scope: { kind: 'agents' } });
    expect(launchFolder(dirs.dev, agents)).toEqual({ ok: true, path: dirs.dev });
    expect(launchFolder(dirs.webapp, agents).ok).toBe(false);
    const all = places({ scope: { kind: 'all' } });
    expect(launchFolder(dirs.ajena, all)).toEqual({ ok: true, path: dirs.ajena });
    expect(launchFolder(dirs.otherDev, all).ok).toBe(false);
  });
});

function agentState(id: number, over: Partial<AgentState> = {}): AgentState {
  return createAgentState({
    id,
    sessionId: `s${id}`,
    projectDir: '/p',
    jsonlFile: `/p/s${id}.jsonl`,
    isExternal: false,
    isWaiting: true,
    officeTerminal: true,
    ...over,
  });
}

describe('teamState', () => {
  it('reads needs, work, done and idle from what the office knows', () => {
    const store = new AgentStateStore();
    const state = (over: Partial<AgentState>, pending = 0) =>
      teamState(1, agentState(1, over), pending, store).kind;
    expect(state({}, 1)).toBe('needs');
    expect(state({ permissionSent: true })).toBe('needs');
    expect(state({ activeToolNames: new Map([['t', 'AskUserQuestion']]) })).toBe('needs');
    expect(state({ isWaiting: false })).toBe('work');
    expect(state({ activeToolIds: new Set(['t']) })).toBe('work');
    expect(state({ background: new Map([['t', { label: 'npm test', at: Date.now() }]]) })).toBe(
      'work',
    );
    expect(state({ lastReply: 'Listo.' })).toBe('done');
    expect(state({})).toBe('idle');
  });

  it('counts a busy meeting member as work', () => {
    const store = new AgentStateStore();
    store.set(2, agentState(2, { leadAgentId: 1, isWaiting: false }));
    expect(teamState(1, agentState(1, { lastReply: 'x' }), 0, store).words).toBe(
      'trabajando (en junta)',
    );
  });
});

describe('the workspace folders the browser sends', () => {
  it('are kept for a workspace supervisor only', () => {
    const store = new AgentStateStore();
    const registry = new SupervisorRegistry(new SupervisionTeams(path.join(root, 't.json')), root);
    registry.attach(store);
    store.set(10, agentState(10, { supervision: workspace }));
    store.set(11, agentState(11, { supervision: { kind: 'agents' } }));
    expect(registry.folders.all().s10).toBeUndefined();
    applySupervisionTeam(
      store,
      { supervisorId: 10, members: [], folders: ['webapp', 7] },
      registry,
    );
    expect(registry.folders.all().s10).toEqual(['webapp']);
    applySupervisionTeam(store, { supervisorId: 10, members: [], folders: [] }, registry);
    expect(registry.folders.all().s10).toEqual([]);
    applySupervisionTeam(store, { supervisorId: 11, members: [], folders: ['x'] }, registry);
    expect(registry.folders.all().s11).toBeUndefined();
  });
});

describe('lanzar_agente and cerrar_agente', () => {
  function office(scope: SupervisionScope = workspace) {
    const store = new AgentStateStore();
    const registry = new SupervisorRegistry(new SupervisionTeams(path.join(root, 't.json')), root);
    registry.attach(store);
    store.set(10, agentState(10, { nickname: 'Jefa', cwd: dirs.dev, supervision: scope }));
    store.set(1, agentState(1, { nickname: 'Pagos', cwd: dirs.dev, lastReply: 'Listo.' }));
    registry.teams.set('s10', ['s1']);
    registry.folders.set('s10', ['development', 'webapp']);

    let nextId = 20;
    const launches: AgentLaunch[] = [];
    const closed: number[] = [];
    let fail = false;
    const pending: PendingPermission[] = [];
    const tools = new SupervisorTools(
      {
        store,
        registry,
        broker: { pending: () => pending, decide: () => true },
        terminalOf: () => undefined,
        // A launch shows up in the office like the real one does.
        launch: async (options) => {
          launches.push(options);
          if (fail) return null;
          const id = nextId++;
          store.set(
            id,
            agentState(id, {
              nickname: options.nickname,
              cwd: options.directoryPath,
              isWaiting: false,
            }),
          );
          return id;
        },
        close: (id) => {
          closed.push(id);
          return store.delete(id);
        },
        folders: () => [
          { name: 'webapp', path: dirs.webapp },
          { name: 'ajena', path: dirs.ajena },
        ],
      },
      10,
    );
    return {
      store,
      registry,
      tools,
      launches,
      closed,
      pending,
      failNext: () => (fail = true),
    };
  }

  const request = (over = {}) => ({
    apodo: 'Tests web',
    carpeta: 'webapp',
    tarea: 'Corré los tests del webapp y contame.',
    ...over,
  });

  it('launches an office agent in a workspace folder, with the request, on its team', async () => {
    const { store, registry, tools, launches } = office();
    const answer = await tools.lanzarAgente(request({ modelo: 'Haiku' }));
    expect(answer).toContain('Listo: abrí a «Tests web» (id 20)');
    expect(launches).toEqual([
      {
        directoryPath: dirs.webapp,
        nickname: 'Tests web',
        prompt: 'Corré los tests del webapp y contame.',
        model: 'haiku',
        effort: undefined,
      },
    ]);
    expect(registry.teamOf(store.get(10)!)).toEqual(['s1', 's20']);
    expect(registry.supervisorsOf('s20')).toEqual([10]);
    // The office remembers who opened it: the browser keeps it in that space.
    expect(registry.launcherOf('s20')).toBe('s10');
    expect(registry.launcherOf('s1')).toBeUndefined();
    expect(tools.equipo()).toContain('«Tests web» (id 20) · trabajando');
  });

  it('never launches outside its scope, without a request or with a bad model', async () => {
    const { tools, launches } = office();
    expect(await tools.lanzarAgente(request({ carpeta: dirs.ajena }))).toContain(
      'no es una carpeta de tu espacio',
    );
    expect(await tools.lanzarAgente(request({ tarea: '  ' }))).toContain('Falta la tarea');
    expect(await tools.lanzarAgente(request({ apodo: '' }))).toContain('Falta el apodo');
    expect(await tools.lanzarAgente(request({ modelo: 'gpt' }))).toContain(
      'No conozco el modelo «gpt»',
    );
    expect(await tools.lanzarAgente(request({ tarea: 'x'.repeat(4001) }))).toContain('muy larga');
    expect(launches).toEqual([]);
  });

  it('refuses a nickname another agent has, and says when the launch failed', async () => {
    const { tools, failNext } = office();
    expect(await tools.lanzarAgente(request({ apodo: 'pagos' }))).toContain(
      'Ya hay un agente «pagos»',
    );
    failNext();
    expect(await tools.lanzarAgente(request())).toContain('No pude abrir a «Tests web» en');
  });

  it('stops at the cap of live launched agents; closing one frees a place', async () => {
    const { store, tools, launches } = office();
    for (let i = 0; i < LAUNCHED_ALIVE_MAX; i++) {
      expect(await tools.lanzarAgente(request({ apodo: `A${i}` }))).toContain('Listo');
    }
    expect(await tools.lanzarAgente(request({ apodo: 'Uno más' }))).toContain(
      `el tope es ${LAUNCHED_ALIVE_MAX}`,
    );
    expect(launches).toHaveLength(LAUNCHED_ALIVE_MAX);
    const first = store.get(20)!;
    first.isWaiting = true;
    first.lastReply = 'Hecho.';
    expect(tools.cerrarAgente('A0')).toBe('Cerré a «A0». Su conversación queda guardada.');
    expect(await tools.lanzarAgente(request({ apodo: 'Uno más' }))).toContain('Listo');
  });

  it('counts launches still on their way against the cap', async () => {
    const { registry, store, tools } = office();
    const done = Array.from({ length: LAUNCHED_ALIVE_MAX }, () => registry.beginLaunch('s10'));
    expect(await tools.lanzarAgente(request())).toContain('el tope es');
    for (const d of done) d();
    expect(registry.launchedAlive(store.get(10)!)).toBe(0);
  });

  it('closes only an agent that finished or has nothing to do', () => {
    const { store, tools, closed, pending } = office();
    const pagos = store.get(1)!;
    pagos.isWaiting = false;
    expect(tools.cerrarAgente('pagos')).toContain('No lo cierro: «Pagos» está trabajando');
    pagos.isWaiting = true;
    pending.push({
      requestId: 'p-1',
      sessionId: 's1',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      createdAt: 1,
    });
    expect(tools.cerrarAgente('pagos')).toContain('te necesita (permiso)');
    pending.length = 0;
    pagos.activeToolNames.set('t', 'AskUserQuestion');
    expect(tools.cerrarAgente('pagos')).toContain('te necesita (pregunta)');
    pagos.activeToolNames.clear();
    expect(closed).toEqual([]);
    pagos.yourTurn = { text: 'mergear el PR 812', id: 'r1' };
    expect(tools.cerrarAgente('pagos')).toContain(
      'Le había dejado a Valentín: «Te toca: mergear el PR 812»',
    );
    expect(closed).toEqual([1]);
  });

  it('closes no one outside its team or outside the office', () => {
    const { store, tools, closed } = office();
    store.set(2, agentState(2, { nickname: 'Ajeno', cwd: dirs.dev }));
    expect(tools.cerrarAgente('Ajeno')).toContain('no está en tu equipo');
    store.get(1)!.officeTerminal = false;
    expect(tools.cerrarAgente('Pagos')).toContain('corre afuera de la oficina');
    expect(closed).toEqual([]);
  });

  it('tells the supervisor when the first turn of an agent it launched ends', async () => {
    const { store, registry, tools } = office();
    const written = new Map<number, string>();
    const queue: Array<() => void> = [];
    const relay = new SupervisorRelay({
      store,
      registry,
      terminalOf: (id) => ({ write: (d: string) => written.set(id, (written.get(id) ?? '') + d) }),
      schedule: (fn) => queue.push(fn),
    });
    await tools.lanzarAgente(request());
    store.get(20)!.lastReply = 'Tests en verde.';
    // No "active" before it: the office only saw the turn end.
    relay.observe({ type: 'agentStatus', id: 20, status: 'waiting' });
    // An agent found waiting (a restart) is still the state, not news.
    relay.observe({ type: 'agentStatus', id: 1, status: 'waiting' });
    while (queue.length) queue.shift()!();
    expect(written.get(10)).toContain('[Oficina] «Tests web» terminó su turno');
    expect(written.get(10)).not.toContain('Pagos');
  });

  it('opens in its own folder when its workspace has no folders (made by hand)', async () => {
    const { registry, tools, launches } = office();
    registry.folders.set('s10', []);
    expect(await tools.lanzarAgente(request({ carpeta: 'development' }))).toContain('Listo');
    expect(launches[0].directoryPath).toBe(dirs.dev);
    expect(await tools.lanzarAgente(request({ apodo: 'Otro', carpeta: dirs.webapp }))).toContain(
      'ni de tu equipo',
    );
  });

  it('tells the supervisor about both tools in its role', () => {
    const role = supervisorPrompt(workspace);
    expect(role).toContain('`lanzar_agente`');
    expect(role).toContain('`cerrar_agente`');
    expect(role).toContain('o una de las del espacio «Wiselink»');
  });
});
