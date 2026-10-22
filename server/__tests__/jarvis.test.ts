import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { PendingPermission } from '../src/permissionBroker.js';
import { jarvisPrompt, Notebook } from '../src/supervisors/jarvis.js';
import { type JarvisLaunch, JarvisTools } from '../src/supervisors/jarvisTools.js';
import {
  SupervisionTeams,
  supervisorPrompt,
  SupervisorRegistry,
} from '../src/supervisors/supervision.js';
import { supervisorMcpServer } from '../src/supervisors/supervisorMcp.js';
import type { AgentState } from '../src/types.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('Jarvis role', () => {
  it('is the role of the supervisor of everyone, and only of that one', () => {
    expect(supervisorPrompt({ kind: 'all' })).toBe(jarvisPrompt());
    for (const tool of ['lanzar_agente', 'cerrar_agente', 'pasar_resultado', 'bitacora']) {
      expect(jarvisPrompt()).toContain(tool);
    }
    expect(jarvisPrompt()).toContain('todos los agentes');
    expect(jarvisPrompt()).toContain('Te toca:');
    expect(supervisorPrompt({ kind: 'agents' })).not.toContain('Jarvis');
  });
});

describe('Notebook', () => {
  it('keeps dated lines, newest last, and shows the latest', () => {
    let minute = 0;
    const book = new Notebook(path.join(dir, 'j', 'bitacora.md'), () => {
      minute += 1;
      return new Date(2026, 9, 22, 9, minute);
    });
    expect(book.read()).toBe('La bitácora está vacía.');
    expect(book.add('  Valentín quiere\nel PR hoy  ')).toBe(true);
    expect(book.add('   ')).toBe(false);
    book.add('Coral sigue con el webapp');
    expect(book.read()).toBe(
      '- 2026-10-22 09:01 Valentín quiere el PR hoy\n- 2026-10-22 09:02 Coral sigue con el webapp',
    );
    expect(book.read(1)).toBe(
      '(1 notas más viejas no se muestran)\n- 2026-10-22 09:02 Coral sigue con el webapp',
    );
  });

  it('forgets the oldest past its size', () => {
    const book = new Notebook(path.join(dir, 'b.md'));
    for (let i = 0; i < 305; i++) book.add(`nota ${i}`);
    const kept = fs.readFileSync(path.join(dir, 'b.md'), 'utf-8').trim().split('\n');
    expect(kept).toHaveLength(300);
    expect(kept[0]).toMatch(/ nota 5$/);
  });
});

// ── A small office: Jarvis (11) and three agents ─────────────────────────

const WORK = 'F:\\proyectos\\app';

function add(store: AgentStateStore, id: number, over: Partial<AgentState> = {}): AgentState {
  const agent = createAgentState({
    id,
    sessionId: `s${id}`,
    projectDir: '/p',
    jsonlFile: `/p/s${id}.jsonl`,
    isExternal: false,
    cwd: WORK,
    nickname: `A${id}`,
    isWaiting: true,
    officeTerminal: true,
    ...over,
  });
  store.set(id, agent);
  return agent;
}

function office() {
  const store = new AgentStateStore();
  const registry = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 'teams.json')), dir);
  registry.attach(store);
  add(store, 1, { nickname: 'Coral', lastReply: 'Abrí el PR 812.' });
  add(store, 2, { nickname: 'Langostino', isWaiting: false });
  add(store, 3, { nickname: 'Vscode', officeTerminal: false });
  add(store, 4, { nickname: 'Pagos' });
  add(store, 11, { nickname: 'Jarvis', supervision: { kind: 'all' } });

  const pending: PendingPermission[] = [
    {
      requestId: 'p-1',
      sessionId: 's4',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      cwd: WORK,
      createdAt: 1,
    },
  ];
  const written = new Map<number, string>();
  const launched: JarvisLaunch[] = [];
  const closed: number[] = [];
  const notebook = new Notebook(path.join(dir, 'bitacora.md'));
  const deps = {
    store,
    registry,
    broker: { pending: () => pending, decide: () => true },
    terminalOf: (id: number) =>
      store.get(id)?.officeTerminal
        ? { write: (d: string) => written.set(id, (written.get(id) ?? '') + d) }
        : undefined,
    launch: async (o: JarvisLaunch) => {
      launched.push(o);
      return o.nickname === 'Falla' ? null : 20;
    },
    close: (id: number) => {
      closed.push(id);
      return true;
    },
    folders: () => [
      { name: 'development', path: dir },
      { name: 'oficina-virtual', path: 'F:\\proyectos\\oficina-virtual' },
      { name: 'oficina-pruebas', path: 'F:\\proyectos\\oficina-pruebas' },
    ],
    notebook,
  };
  return { store, deps, written, launched, closed, notebook, t: new JarvisTools(deps, 11) };
}

describe('JarvisTools', () => {
  it('lists the folders it can open agents in, its agents’ ones too, once each', () => {
    const { t } = office();
    const list = t.carpetas();
    expect(list).toContain(`- «development»: ${dir}`);
    expect(list).toContain('- «app»: F:\\proyectos\\app');
    expect(list.match(/«app»/g)).toHaveLength(1);
  });

  it('opens an agent in a folder by name, and notes it down', async () => {
    const { t, launched, notebook } = office();
    const answer = await t.lanzarAgente({
      carpeta: 'Development',
      tarea: 'Arreglá el WISE-6400 y abrí el PR contra develop.',
      apodo: 'Pulpo',
      modelo: 'Sonnet',
    });
    expect(answer).toContain('Abrí a «Pulpo» (id 20)');
    expect(launched).toEqual([
      {
        directoryPath: dir,
        prompt: 'Arreglá el WISE-6400 y abrí el PR contra develop.',
        nickname: 'Pulpo',
        model: 'sonnet',
        effort: undefined,
      },
    ]);
    expect(notebook.read()).toContain('Abrí a «Pulpo» (id 20) en');
  });

  it('takes a full path, and says why it does not open', async () => {
    const { t, launched } = office();
    const ok = { tarea: 'Hacé algo', apodo: 'Nuevo' };
    expect(await t.lanzarAgente({ ...ok, carpeta: dir })).toContain('Abrí');
    expect(await t.lanzarAgente({ ...ok, carpeta: path.join(dir, 'no-existe') })).toContain(
      'no existe',
    );
    expect(await t.lanzarAgente({ ...ok, carpeta: 'oficina' })).toContain('más de una carpeta');
    expect(await t.lanzarAgente({ ...ok, carpeta: 'marte' })).toContain('No conozco la carpeta');
    expect(await t.lanzarAgente({ ...ok, carpeta: dir, tarea: ' ' })).toContain('Falta la tarea');
    expect(await t.lanzarAgente({ ...ok, carpeta: dir, tarea: 'x'.repeat(4001) })).toContain(
      'muy larga',
    );
    expect(await t.lanzarAgente({ ...ok, carpeta: dir, apodo: 'coral' })).toContain(
      'Ya hay un agente «coral»',
    );
    expect(await t.lanzarAgente({ ...ok, carpeta: dir, modelo: 'gpt' })).toContain(
      'No conozco el modelo',
    );
    expect(await t.lanzarAgente({ ...ok, carpeta: dir, apodo: 'Falla' })).toContain(
      'No pude abrir',
    );
    expect(launched.map((l) => l.nickname)).toEqual(['Nuevo', 'Falla']);
  });

  it('closes only an office agent that finished and waits for nothing', () => {
    const { store, t, closed, notebook } = office();
    expect(t.cerrarAgente('Langostino')).toContain('está trabajando');
    expect(t.cerrarAgente('Vscode')).toContain('no corre en la oficina');
    expect(t.cerrarAgente('Pagos')).toContain('permiso pendiente');
    store.get(1)!.background = new Map([['b', { label: 'npm run build', at: Date.now() }]]);
    expect(t.cerrarAgente('Coral')).toContain('segundo plano');
    store.get(1)!.background = undefined;
    expect(t.cerrarAgente('coral')).toContain('Cerré a «Coral»');
    expect(t.cerrarAgente('Jarvis')).toContain('no está en tu equipo');
    expect(closed).toEqual([1]);
    expect(notebook.read()).toContain('Cerré a «Coral».');
  });

  it('hands one agent’s answer to another, with a note', () => {
    const { t, written, notebook } = office();
    expect(t.pasarResultado('Coral', 'Pagos', 'Revisalo')).toContain('«Pagos» recibió');
    const sent = written.get(4) ?? '';
    expect(sent).toContain('[Supervisor «Jarvis»] Revisalo');
    expect(sent).toContain('Te paso lo último que respondió «Coral»');
    expect(sent).toContain('Abrí el PR 812.');
    expect(notebook.read()).toContain('Le pasé a «Pagos» lo de «Coral»: Revisalo');
    expect(t.pasarResultado('Coral', 'Coral')).toContain('mismo agente');
    expect(t.pasarResultado('Pagos', 'Coral')).toContain('todavía no respondió');
    expect(t.pasarResultado('Coral', 'Vscode')).toContain('SendMessage');
  });

  it('notes what it writes, and sends outside agents to SendMessage', () => {
    const { t, notebook } = office();
    expect(t.escribirAAgente('Pagos', 'seguí')).toContain('Listo');
    expect(notebook.read()).toContain('Le escribí a «Pagos»: seguí');
    expect(t.escribirAAgente('Vscode', 'hola')).toContain('SendMessage');
    expect(t.equipo()).toContain('«Vscode» (id 3) · sin tarea');
    expect(t.equipo()).toContain('no corre en la oficina (escribile con SendMessage)');
    expect(t.anotar('Valentín decide el merge')).toBe('Anotado.');
    expect(t.bitacora()).toContain('Valentín decide el merge');
  });
});

describe('the MCP server', () => {
  async function toolNames(supervisorId: number): Promise<string[]> {
    const { deps, store } = office();
    add(store, 12, { nickname: 'Jefa', supervision: { kind: 'agents' } });
    const server = supervisorMcpServer(deps, supervisorId);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((tool) => tool.name).sort();
  }

  it('gives Jarvis its own tools, and other supervisors only theirs', async () => {
    const shared = [
      'aprobar_permiso',
      'equipo',
      'escribir_a_agente',
      'rechazar_permiso',
      'ultima_respuesta',
    ];
    expect(await toolNames(12)).toEqual(shared);
    expect(await toolNames(11)).toEqual(
      [
        ...shared,
        'anotar',
        'bitacora',
        'carpetas',
        'cerrar_agente',
        'lanzar_agente',
        'pasar_resultado',
      ].sort(),
    );
  });
});
