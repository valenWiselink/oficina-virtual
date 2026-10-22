/**
 * Supervisor agents: an office agent that watches over others (a workspace,
 * agents picked by hand, or everyone) and stands between them and Valentín —
 * their permissions, questions and finished turns reach it, it approves what
 * is safe and brings him the rest.
 *
 * This module keeps who supervises whom: the scope lives with the
 * supervisor (its resumable session, so relaunches keep it), the team of a
 * "workspace" or "agents" scope comes from the browser (workspaces live
 * there) and is saved in ~/.pixel-agents/oficina-supervision.json. It also
 * writes the files a supervisor is launched with (its MCP config, carrying a
 * token of its own, and its role prompt).
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from '../agentStateStore.js';
import { SERVER_JSON_DIR } from '../constants.js';
import type { AgentState } from '../types.js';
import { jarvisPrompt } from './jarvis.js';

export type SupervisionScope =
  { kind: 'workspace'; workspaceId: string; name: string } | { kind: 'agents' } | { kind: 'all' };

/** The MCP server name in a supervisor's config: its tools are mcp__oficina__*. */
export const MCP_SERVER_NAME = 'oficina';
export const MCP_ALLOWED_TOOLS = `mcp__${MCP_SERVER_NAME}__*`;
/** Agents a supervisor launched that may be alive at once (lanzar_agente):
 *  past this it closes one that finished, or Valentín decides. */
export const LAUNCHED_ALIVE_MAX = 4;
const NAME_MAX = 60;

/**
 * A scope from the wire: the scope, null for "no longer a supervisor", or
 * undefined when it is not valid.
 */
export function parseScope(value: unknown): SupervisionScope | null | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'none':
      return null;
    case 'all':
      return { kind: 'all' };
    case 'agents':
      return { kind: 'agents' };
    case 'workspace':
      if (typeof v.workspaceId !== 'string' || !v.workspaceId) return undefined;
      return {
        kind: 'workspace',
        workspaceId: v.workspaceId.slice(0, NAME_MAX),
        name:
          typeof v.name === 'string' && v.name.trim()
            ? v.name.trim().slice(0, NAME_MAX)
            : 'su espacio',
      };
    default:
      return undefined;
  }
}

/** What a supervisor watches over, in words ("«Wiselink»", "todos los agentes"). */
export function scopeWords(scope: SupervisionScope): string {
  if (scope.kind === 'workspace') return `el espacio «${scope.name}»`;
  if (scope.kind === 'all') return 'todos los agentes de la oficina';
  return 'los agentes que te asignaron';
}

/** Where a team supervisor may launch agents, in words (supervisorLaunch.ts
 *  decides; the supervisor of everyone is Jarvis, with its own rules). */
function launchWhere(scope: SupervisionScope): string {
  if (scope.kind === 'workspace') return `una de las carpetas del espacio «${scope.name}»`;
  return 'la tuya o la de uno de tus agentes';
}

/** The role a supervisor is launched with (--append-system-prompt-file). The
 *  supervisor of everyone is Jarvis (jarvis.ts). */
export function supervisorPrompt(scope: SupervisionScope): string {
  if (scope.kind === 'all') return jarvisPrompt();
  return `# Sos supervisor en la Oficina virtual

Supervisás ${scopeWords(scope)}. Sos el intermediario entre esos agentes y Valentín: le ahorrás tener que mirar a cada uno.

## Cómo te enterás
Vas a recibir mensajes que empiezan con "[Oficina]": te los escribe la oficina, no Valentín. Te avisan cuando uno de tus agentes pide un permiso, cuando te hace una pregunta o necesita una decisión, y cuando termina un turno. Para mirar más, usá tus herramientas de la oficina: \`equipo\` (quiénes son y en qué están, con los permisos pendientes y sus ids) y \`ultima_respuesta\` (lo último que dijo uno).

## Qué hacés
- Cuando un agente termina: contale a Valentín en 1 o 2 líneas qué hizo. Nada más.
- Permisos: aprobá con \`aprobar_permiso\` sólo lo claramente seguro (leer, buscar, correr tests, lint o builds locales, editar archivos dentro de su carpeta). La oficina igual rechaza lo peligroso aunque lo apruebes. Todo lo demás pedíselo a Valentín con una línea propia que empiece con "Te toca:", con el id del permiso, qué pide el agente y tu recomendación. Si algo está claramente mal, podés usar \`rechazar_permiso\` con el motivo.
- Preguntas y decisiones de tus agentes: traéselas a Valentín con "Te toca:" y tu recomendación. Cuando él te conteste, pasale la respuesta al agente con \`escribir_a_agente\`.
- Podés coordinar a tus agentes con \`escribir_a_agente\` (pedirle a uno que siga, pasarle algo de otro).
- Cuando Valentín te pida algo que tiene que hacer otro agente, abrí uno por pedido con \`lanzar_agente\`: un apodo corto, la carpeta (${launchWhere(scope)}) y una tarea que pueda hacer sin vos (qué hacer, en qué repo o ticket, qué entregar), que es su primer mensaje. Entra a tu equipo y la oficina te avisa cuando pida algo o termine. Hay un tope de ${LAUNCHED_ALIVE_MAX} agentes abiertos por vos andando a la vez.
- Cuando uno terminó lo que se le pidió y ya le reportaste a Valentín lo que hizo (y lo que le dejó con "Te toca:"), cerralo con \`cerrar_agente\`. La oficina sólo deja cerrar a los que están en «Terminó» o «Sin tarea»; si quedó esperando una respuesta, no lo cierres.

## Qué no hacés
- No hacés el trabajo de ellos ni tocás código.
- No mandás resúmenes por tu cuenta: sólo cuando Valentín te los pide.
- Respuestas cortas, en castellano rioplatense.
`;
}

/** The --mcp-config file: the office's MCP endpoint with this supervisor's token. */
export function mcpConfig(url: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2,
  );
}

/** Teams picked in the browser (scopes "workspace" and "agents"), on disk and
 *  cached (identity messages ask for them often). */
export class SupervisionTeams {
  private cache: Record<string, string[]> | undefined;

  constructor(
    private readonly filePath = path.join(
      os.homedir(),
      SERVER_JSON_DIR,
      'oficina-supervision.json',
    ),
  ) {}

  all(): Record<string, string[]> {
    this.cache ??= this.read();
    return { ...this.cache };
  }

  private read(): Record<string, string[]> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      const teams: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value))
          teams[key] = value.filter((v): v is string => typeof v === 'string');
      }
      return teams;
    } catch {
      return {};
    }
  }

  get(supervisorSessionId: string): string[] {
    return this.all()[supervisorSessionId] ?? [];
  }

  /** Returns false when the team was already this one (an empty one is kept
   *  too: "sent, and empty" is not "never sent"). */
  set(supervisorSessionId: string, members: string[]): boolean {
    const clean = [...new Set(members.filter((m) => m && m !== supervisorSessionId))].sort();
    const teams = this.all();
    const before = (teams[supervisorSessionId] ?? []).slice().sort();
    const same = before.length === clean.length && before.every((m, i) => m === clean[i]);
    if (same && supervisorSessionId in teams) return false;
    teams[supervisorSessionId] = clean;
    this.write(teams);
    return true;
  }

  remove(supervisorSessionId: string): void {
    const teams = this.all();
    if (!(supervisorSessionId in teams)) return;
    delete teams[supervisorSessionId];
    this.write(teams);
  }

  private write(teams: Record<string, string[]>): void {
    this.cache = teams;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(teams, null, 2));
    } catch (err) {
      console.error(`[Pixel Agents] Could not save supervision teams: ${String(err)}`);
    }
  }
}

/** A top-level agent with a session (not a subagent or background child). */
function isAgent(agent: AgentState): boolean {
  return agent.leadAgentId === undefined && !agent.spawnToolUseId && !!agent.sessionId;
}

/**
 * Who supervises whom, live. One per office (supervisors()); tests build
 * their own with a temporary file and folder.
 */
export class SupervisorRegistry {
  private store: AgentStateStore | undefined;
  private officeUrl: string | undefined;
  /** Token → the supervisor's session id (fresh on every launch), kept on
   *  disk: a supervisor running as a background session outlives the office
   *  and keeps calling it with the token it was launched with. */
  private tokenMap: Map<string, string> | undefined;

  private get tokens(): Map<string, string> {
    if (!this.tokenMap) {
      this.tokenMap = new Map();
      try {
        const saved = JSON.parse(
          fs.readFileSync(path.join(this.filesDir, 'tokens.json'), 'utf-8'),
        ) as Record<string, unknown>;
        for (const [token, owner] of Object.entries(saved)) {
          if (typeof owner === 'string') this.tokenMap.set(token, owner);
        }
      } catch {
        /* none yet */
      }
    }
    return this.tokenMap;
  }

  private saveTokens(): void {
    try {
      fs.mkdirSync(this.filesDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.filesDir, 'tokens.json'),
        JSON.stringify(Object.fromEntries(this.tokens), null, 2),
      );
    } catch (err) {
      console.error(`[Pixel Agents] Could not save supervisor tokens: ${String(err)}`);
    }
  }

  /** Workspace supervisors: the folder names whose agents land in their
   *  workspace, as the browser sends them with the team — where they may
   *  launch agents. */
  readonly folders: SupervisionTeams;
  /** The sessions each supervisor launched: its live ones count against
   *  LAUNCHED_ALIVE_MAX. */
  readonly launched: SupervisionTeams;
  /** Launches still on their way, per supervisor session. */
  private readonly launching = new Map<string, number>();
  /** Sessions a supervisor just launched: the end of their first turn is
   *  news even when no "active" status came before it (supervisorRelay). */
  private readonly firstTurn = new Set<string>();

  constructor(
    readonly teams = new SupervisionTeams(),
    private readonly filesDir = path.join(os.homedir(), SERVER_JSON_DIR, 'supervisores'),
  ) {
    this.folders = new SupervisionTeams(path.join(filesDir, 'carpetas.json'));
    this.launched = new SupervisionTeams(path.join(filesDir, 'lanzados.json'));
  }

  attach(store: AgentStateStore): void {
    this.store = store;
  }

  /** The office's own address, once it listens (the MCP endpoint hangs off it). */
  setOfficeUrl(url: string): void {
    this.officeUrl = url.replace(/\/$/, '');
  }

  /** The session ids a supervisor is in charge of (never itself, never a supervisor
   *  for "all"). */
  teamOf(supervisor: AgentState): string[] {
    if (!supervisor.supervision) return [];
    if (supervisor.supervision.kind === 'all') {
      if (!this.store) return [];
      return [...this.store.values()]
        .filter((a) => isAgent(a) && !a.supervision && a.sessionId !== supervisor.sessionId)
        .map((a) => a.sessionId);
    }
    return this.teams.get(supervisor.sessionId).filter((s) => s !== supervisor.sessionId);
  }

  /** The live members of a supervisor's team: [agent id, agent]. */
  members(supervisorId: number): Array<[number, AgentState]> {
    const supervisor = this.store?.get(supervisorId);
    if (!this.store || !supervisor?.supervision) return [];
    const team = new Set(this.teamOf(supervisor));
    return [...this.store.entries()].filter(([, a]) => isAgent(a) && team.has(a.sessionId));
  }

  /** How many agents it launched are alive (in the office or on their way). */
  launchedAlive(supervisor: AgentState): number {
    const mine = new Set(this.launched.get(supervisor.sessionId));
    const live = [...(this.store?.values() ?? [])].filter((a) => mine.has(a.sessionId)).length;
    return live + (this.launching.get(supervisor.sessionId) ?? 0);
  }

  /** A launch is on its way: it counts until the returned function runs. */
  beginLaunch(supervisorSessionId: string): () => void {
    this.launching.set(supervisorSessionId, (this.launching.get(supervisorSessionId) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const left = (this.launching.get(supervisorSessionId) ?? 1) - 1;
      if (left > 0) this.launching.set(supervisorSessionId, left);
      else this.launching.delete(supervisorSessionId);
    };
  }

  /** It launched this session: counted against its cap (only the live ones
   *  are kept) and on its team at once — a workspace's team is confirmed by
   *  the browser, which puts it there by the same folder rule. */
  noteLaunched(supervisor: AgentState, sessionId: string): void {
    const live = new Set([...(this.store?.values() ?? [])].map((a) => a.sessionId));
    const mine = this.launched.get(supervisor.sessionId).filter((s) => live.has(s));
    this.launched.set(supervisor.sessionId, [...mine, sessionId]);
    this.firstTurn.add(sessionId);
    if (supervisor.supervision && supervisor.supervision.kind !== 'all') {
      this.teams.set(supervisor.sessionId, [...this.teams.get(supervisor.sessionId), sessionId]);
    }
  }

  /** Once, for the first status seen of a session a supervisor just launched. */
  takeFirstTurn(sessionId: string): boolean {
    return this.firstTurn.delete(sessionId);
  }

  /** The live supervisors (agent ids) a session is supervised by. */
  supervisorsOf(sessionId: string): number[] {
    if (!this.store || !sessionId) return [];
    const ids: number[] = [];
    for (const [id, agent] of this.store.entries()) {
      if (!agent.supervision || !isAgent(agent) || agent.sessionId === sessionId) continue;
      if (this.teamOf(agent).includes(sessionId)) ids.push(id);
    }
    return ids;
  }

  /** The live supervisor holding this token, if any. */
  supervisorByToken(token: string | undefined): number | undefined {
    const sessionId = token ? this.tokens.get(token) : undefined;
    if (!sessionId || !this.store) return undefined;
    for (const [id, agent] of this.store.entries()) {
      if (agent.sessionId === sessionId && agent.supervision && isAgent(agent)) return id;
    }
    return undefined;
  }

  /**
   * Write a supervisor's launch files (a fresh token each time) and return the
   * extra flags for Claude Code. Files, not inline JSON: Windows terminals
   * mangle quotes on a command line.
   */
  prepareLaunch(sessionId: string, scope: SupervisionScope): string[] {
    for (const [token, owner] of this.tokens) if (owner === sessionId) this.tokens.delete(token);
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, sessionId);
    this.saveTokens();
    const url = `${this.officeUrl ?? 'http://127.0.0.1:3100'}/mcp`;
    fs.mkdirSync(this.filesDir, { recursive: true });
    const mcpPath = path.join(this.filesDir, `${sessionId}.mcp.json`);
    const promptPath = path.join(this.filesDir, `${sessionId}.rol.md`);
    fs.writeFileSync(mcpPath, mcpConfig(url, token));
    fs.writeFileSync(promptPath, supervisorPrompt(scope));
    return [
      '--mcp-config',
      mcpPath,
      '--append-system-prompt-file',
      promptPath,
      '--allowedTools',
      MCP_ALLOWED_TOOLS,
    ];
  }

  /** A fresh background supervisor gets its session id from Claude Code only
   *  after it started (with files written under a provisional id): its token
   *  now answers for the real session. The provisional files stay as Claude
   *  read them; the next launch writes its own. */
  rebind(provisionalId: string, sessionId: string): void {
    for (const [token, owner] of this.tokens) {
      if (owner === provisionalId) this.tokens.set(token, sessionId);
    }
    this.saveTokens();
  }

  /** No longer a supervisor: its token and files go (and what it launched
   *  stops counting against anyone). */
  forget(sessionId: string): void {
    for (const [token, owner] of this.tokens) if (owner === sessionId) this.tokens.delete(token);
    this.saveTokens();
    this.folders.remove(sessionId);
    this.launched.remove(sessionId);
    for (const ext of ['mcp.json', 'rol.md']) {
      fs.rmSync(path.join(this.filesDir, `${sessionId}.${ext}`), { force: true });
    }
  }
}

let shared: SupervisorRegistry | undefined;

/** The office's registry. */
export function supervisors(): SupervisorRegistry {
  shared ??= new SupervisorRegistry();
  return shared;
}
