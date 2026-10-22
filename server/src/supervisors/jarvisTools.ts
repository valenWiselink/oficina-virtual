/**
 * Jarvis's tools (jarvis.ts): everything a supervisor has, plus opening an
 * agent, closing one, handing one agent's answer to another and its notebook.
 * Only the supervisor of everyone gets them (supervisorMcp.ts). What it opens,
 * closes and passes on is written in the notebook by the office itself, so the
 * notebook does not depend on Jarvis remembering to.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import { z } from 'zod';

import { cleanEffort, cleanModel } from '../agentEdits.js';
import { runningBackground, spokenName } from '../agentIdentity.js';
import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { LAUNCH_PROMPT_MAX_LENGTH } from '../clientMessageHandler.js';
import { listDirectories, normalizeDirectoryPath, validateDirectoryPath } from '../directories.js';
import { collectDirectorySuggestions } from '../directorySuggestions.js';
import { hostDirectory } from '../hostDirectory.js';
import { claudeProvider } from '../providers/index.js';
import { closeOfficeAgent } from '../terminal/closeAgent.js';
import { handOffText, sendToTerminal } from '../terminal/handOff.js';
import type { PtySessionManager } from '../terminal/ptySessionManager.js';
import { launchAgent } from '../terminal/standaloneAgentLauncher.js';
import type { AgentState } from '../types.js';
import { Notebook } from './jarvis.js';
import { SupervisorTools, type ToolDeps } from './supervisorTools.js';

/** The same limit as the launch dialog's name field. */
const NICKNAME_MAX = 32;

export interface JarvisLaunch {
  directoryPath: string;
  prompt: string;
  nickname: string;
  model?: string;
  effort?: string;
}

/** What only Jarvis can do, wired by the office (jarvisPowers). */
export interface JarvisDeps extends ToolDeps {
  /** Open an agent; resolves to its id, or null when it could not start. */
  launch?: (options: JarvisLaunch) => Promise<number | null>;
  close?: (id: number) => boolean;
  /** Where an agent can be opened: the office's folders and recent ones. */
  folders?: () => Array<{ name: string; path: string }>;
  notebook?: Notebook;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

export class JarvisTools extends SupervisorTools {
  private readonly notebook: Notebook;

  constructor(
    private readonly jarvis: JarvisDeps,
    supervisorId: number,
  ) {
    super(jarvis, supervisorId);
    this.notebook = jarvis.notebook ?? new Notebook();
  }

  protected override outsideNote(): string {
    return 'no corre en la oficina (escribile con SendMessage)';
  }

  protected override noTerminal(name: string): string {
    return `«${name}» no corre en la oficina: escribile con SendMessage (buscalo con ListAgents).`;
  }

  /** Every folder Jarvis may open an agent in, deduped, the office's own first. */
  private folderList(): Array<{ name: string; path: string }> {
    const seen = new Set<string>();
    const out: Array<{ name: string; path: string }> = [];
    const add = (name: string, folder: string | undefined) => {
      if (!folder) return;
      const key = normalizeDirectoryPath(folder);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, path: folder });
    };
    for (const f of this.jarvis.folders?.() ?? []) add(f.name, f.path);
    for (const [, agent] of this.members()) add(path.basename(agent.cwd ?? ''), agent.cwd);
    return out;
  }

  carpetas(): string {
    const folders = this.folderList();
    if (folders.length === 0) {
      return 'No conozco ninguna carpeta todavía: pasale a lanzar_agente la ruta completa.';
    }
    return folders.map((f) => `- «${f.name}»: ${f.path}`).join('\n');
  }

  /** A folder by its name (exact, then a unique partial match) or its full path. */
  private folder(query: string): string | { error: string } {
    const q = query.trim().replace(/^«|»$/g, '');
    if (!q)
      return { error: 'Decime en qué carpeta: su nombre (mirá carpetas) o la ruta completa.' };
    if (path.isAbsolute(q)) {
      const valid = validateDirectoryPath(q);
      return valid.ok ? valid.path : { error: `Esa carpeta no existe: ${q}` };
    }
    const folders = this.folderList();
    const lower = q.toLowerCase();
    const exact = folders.filter((f) => f.name.toLowerCase() === lower);
    if (exact.length === 1) return exact[0].path;
    const partial = folders.filter((f) => f.name.toLowerCase().includes(lower));
    if (partial.length === 1) return partial[0].path;
    const names = folders.map((f) => `«${f.name}»`).join(', ');
    return {
      error:
        partial.length > 1 || exact.length > 1
          ? `Hay más de una carpeta que coincide con «${q}»: pasame la ruta completa. Carpetas: ${names}.`
          : `No conozco la carpeta «${q}». Carpetas: ${names || 'ninguna todavía'}. También sirve la ruta completa.`,
    };
  }

  override async lanzarAgente(input: {
    carpeta: string;
    tarea: string;
    apodo: string;
    modelo?: string;
    esfuerzo?: string;
  }): Promise<string> {
    if (!this.jarvis.launch) return 'Esta oficina no puede abrir agentes (no tiene terminales).';
    const tarea = input.tarea.trim();
    if (!tarea) return 'Falta la tarea: un agente sin tarea no sirve.';
    if (tarea.length > LAUNCH_PROMPT_MAX_LENGTH) {
      return `La tarea es muy larga (máximo ${LAUNCH_PROMPT_MAX_LENGTH} caracteres): resumila y, si hace falta, pasale el resto después con escribir_a_agente.`;
    }
    const apodo = input.apodo.trim().replace(/^«|»$/g, '');
    if (!apodo) return 'Falta el apodo: uno corto y fácil de decir.';
    if (apodo.length > NICKNAME_MAX) return `El apodo es muy largo (máximo ${NICKNAME_MAX}).`;
    // Among top-level agents (subagents are not called by name).
    const taken = [...this.deps.store.values()].some(
      (a) =>
        a.leadAgentId === undefined &&
        !a.spawnToolUseId &&
        spokenName(a).toLowerCase() === apodo.toLowerCase(),
    );
    if (taken) return `Ya hay un agente «${apodo}»: elegí otro apodo.`;
    const model = input.modelo ? cleanModel(input.modelo) : undefined;
    if (input.modelo && !model)
      return `No conozco el modelo «${input.modelo}» (usá opus, sonnet, haiku o fable).`;
    const effort = input.esfuerzo ? cleanEffort(input.esfuerzo) : undefined;
    if (input.esfuerzo && !effort) return `No conozco el esfuerzo «${input.esfuerzo}».`;
    const folder = this.folder(input.carpeta);
    if (typeof folder !== 'string') return folder.error;

    const id = await this.jarvis.launch({
      directoryPath: folder,
      prompt: tarea,
      nickname: apodo,
      model,
      effort,
    });
    if (id === null)
      return `No pude abrir a «${apodo}» en ${folder}: la oficina muestra el motivo.`;
    this.notebook.add(`Abrí a «${apodo}» (id ${id}) en ${path.basename(folder)}: ${tarea}`);
    return `Abrí a «${apodo}» (id ${id}) en ${folder}. Ya arrancó con la tarea; te aviso cuando termine.`;
  }

  override cerrarAgente(query: string): string {
    if (!this.jarvis.close) return 'Esta oficina no puede cerrar agentes.';
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [id, agent] = found;
    const name = spokenName(agent);
    if (!agent.officeTerminal) return `«${name}» no corre en la oficina: no lo puedo cerrar.`;
    if (this.pendingOf(agent).length > 0) {
      return `«${name}» tiene un permiso pendiente: primero hay que contestarlo.`;
    }
    if (!agent.isWaiting) {
      return `«${name}» está trabajando: no lo cierro. Si hay que cortarlo, que lo decida Valentín.`;
    }
    if (runningBackground(agent).length > 0) {
      return `«${name}» está esperando algo que corre en segundo plano: no lo cierro todavía.`;
    }
    if (!this.jarvis.close(id)) return `No pude cerrar a «${name}».`;
    this.notebook.add(`Cerré a «${name}».`);
    return `Cerré a «${name}». Su conversación queda guardada.`;
  }

  pasarResultado(de: string, a: string, nota?: string): string {
    const from = this.find(de);
    if (typeof from === 'string') return from;
    const to = this.find(a);
    if (typeof to === 'string') return to;
    const [fromId, fromAgent] = from;
    const [toId, toAgent] = to;
    if (fromId === toId) return 'Es el mismo agente: no tiene sentido pasárselo a sí mismo.';
    const reply = fromAgent.lastReply?.trim();
    if (!reply) return `«${spokenName(fromAgent)}» todavía no respondió nada.`;
    const terminal = this.deps.terminalOf(toId);
    if (!terminal) return this.noTerminal(spokenName(toAgent));
    const extra = nota?.trim();
    const body = handOffText(spokenName(fromAgent), reply);
    sendToTerminal(terminal, `${this.signature()} ${extra ? `${extra}\n\n${body}` : body}`);
    this.notebook.add(
      `Le pasé a «${spokenName(toAgent)}» lo de «${spokenName(fromAgent)}»${extra ? `: ${extra}` : '.'}`,
    );
    return `Listo: «${spokenName(toAgent)}» recibió lo último de «${spokenName(fromAgent)}».`;
  }

  protected override wrote(agent: AgentState, message: string): void {
    this.notebook.add(`Le escribí a «${spokenName(agent)}»: ${message}`);
  }

  bitacora(): string {
    return this.notebook.read();
  }

  anotar(nota: string): string {
    if (!nota.trim()) return 'La nota está vacía.';
    return this.notebook.add(nota) ? 'Anotado.' : 'No pude guardar la nota.';
  }
}

/** Register Jarvis's own tools (the shared ones are registered by the caller). */
export function registerJarvisTools(server: McpServer, tools: JarvisTools): void {
  server.registerTool(
    'carpetas',
    { description: 'Las carpetas donde podés abrir un agente: su nombre y su ruta.' },
    () => text(tools.carpetas()),
  );
  server.registerTool(
    'lanzar_agente',
    {
      description:
        'Abre un agente nuevo de Claude Code en la oficina, con su primera tarea. Valentín lo ve en el tablero y te llegan sus avisos como los de cualquier otro.',
      inputSchema: {
        carpeta: z.string().describe('Nombre de la carpeta (ver carpetas) o ruta completa'),
        tarea: z
          .string()
          .describe('Su primer mensaje: qué hacer, en qué repo o ticket y qué entregar'),
        apodo: z.string().describe('Corto, fácil de decir y distinto de los que ya hay'),
        modelo: z
          .string()
          .optional()
          .describe('opus, sonnet, haiku o fable; sin esto, el de siempre'),
        esfuerzo: z
          .string()
          .optional()
          .describe('low, medium, high, xhigh o max; sin esto, el de siempre'),
      },
    },
    async (input) => text(await tools.lanzarAgente(input)),
  );
  server.registerTool(
    'cerrar_agente',
    {
      description:
        'Cierra un agente de la oficina que terminó (su conversación queda guardada). No cierra uno que está trabajando, esperando algo o con un permiso pendiente.',
      inputSchema: { agente: z.string().describe('Nombre o id del agente') },
    },
    ({ agente }) => text(tools.cerrarAgente(agente)),
  );
  server.registerTool(
    'pasar_resultado',
    {
      description:
        'Le manda a un agente lo último que respondió otro, con una nota tuya opcional (qué hacer con eso).',
      inputSchema: {
        de: z.string().describe('Nombre o id del agente que lo hizo'),
        a: z.string().describe('Nombre o id del agente que lo recibe'),
        nota: z.string().optional().describe('Qué tiene que hacer con eso'),
      },
    },
    ({ de, a, nota }) => text(tools.pasarResultado(de, a, nota)),
  );
  server.registerTool(
    'bitacora',
    {
      description:
        'Tu libreta: lo que abriste, cerraste y pasaste, y lo que anotaste (decisiones, pendientes). Lo más nuevo, al final.',
    },
    () => text(tools.bitacora()),
  );
  server.registerTool(
    'anotar',
    {
      description:
        'Anota una línea en tu bitácora: una decisión de Valentín, un pendiente, a quién le toca qué.',
      inputSchema: { nota: z.string().describe('Lo que no querés olvidar, en una línea') },
    },
    ({ nota }) => text(tools.anotar(nota)),
  );
}

/** The office's side of Jarvis's tools: how it opens, closes and lists folders. */
export function jarvisPowers(office: {
  store: AgentStateStore;
  runtime?: AgentRuntime;
  ptyManager?: PtySessionManager;
}): Pick<JarvisDeps, 'launch' | 'close' | 'folders'> {
  const { store, runtime, ptyManager } = office;
  if (!runtime || !ptyManager) return {};
  return {
    launch: (o) =>
      launchAgent(
        { store, runtime, ptyManager, provider: claudeProvider },
        {
          ...o,
          // The host's permission posture, like every launch from the office.
          bypassPermissions:
            store.getAdapter()?.getSetting('pixel-agents.bypassPermissions', false) ?? false,
        },
      ),
    close: (id) => closeOfficeAgent({ store, runtime, ptyManager }, id),
    folders: () => {
      const hosts = [hostDirectory()];
      return [
        ...listDirectories(hosts).map((d) => ({ name: d.name, path: d.path })),
        ...collectDirectorySuggestions(claudeProvider, hosts).map((p) => ({
          name: path.basename(p),
          path: p,
        })),
      ];
    },
  };
}
