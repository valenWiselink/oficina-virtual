/**
 * The office tools a supervisor gets over MCP (supervisorMcp.ts): see its
 * team, read an agent's last answer, approve or refuse a permission, write to
 * one of its agents, open one for a task and close one that finished.
 * Everything is limited to its own team; approvals also pass the office's
 * guard (supervisorGuard.ts) and launches their own (supervisorLaunch.ts),
 * whatever the supervisor says. Answers are plain text in castellano,
 * written for Claude to act on. The supervisor of everyone (Jarvis) opens and
 * closes agents by its own rules (jarvisTools.ts).
 */

import {
  cleanEffort,
  cleanModel,
  EFFORT_LEVELS,
  MODEL_ALIASES,
  NICKNAME_MAX,
} from '../agentEdits.js';
import { spokenName } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { LAUNCH_PROMPT_MAX_LENGTH } from '../clientMessageHandler.js';
import type { PendingPermission, PermissionBroker } from '../permissionBroker.js';
import { sendToTerminal } from '../terminal/handOff.js';
import type { AgentState } from '../types.js';
import {
  LAUNCHED_ALIVE_MAX,
  type SupervisionScope,
  type SupervisorRegistry,
} from './supervision.js';
import { broadcastSupervision } from './supervisionMessages.js';
import { supervisorMayApprove } from './supervisorGuard.js';
import { launchFolder, type LaunchPlaces, teamState } from './supervisorLaunch.js';
import { describeRequest } from './supervisorRelay.js';

/** An agent launch as the office runs it (jarvisPowers wires it). */
export interface AgentLaunch {
  directoryPath: string;
  prompt: string;
  nickname: string;
  model?: string;
  effort?: string;
}

/** What lanzar_agente asks for: the same words for every supervisor. */
export interface LaunchInput {
  carpeta: string;
  tarea: string;
  apodo: string;
  modelo?: string;
  esfuerzo?: string;
}

export interface ToolDeps {
  store: AgentStateStore;
  registry: SupervisorRegistry;
  broker?: Pick<PermissionBroker, 'pending' | 'decide'>;
  terminalOf: (id: number) => { write(data: string): void } | undefined;
  /** Open an agent like the launch dialog does; resolves to its id, or null
   *  when it could not start (absent: this office has no terminals). */
  launch?: (options: AgentLaunch) => Promise<number | null>;
  /** Close an agent like the office's ✕ does. */
  close?: (id: number) => boolean;
  /** Where an agent can be opened: the office's folders and recent ones. */
  folders?: () => Array<{ name: string; path: string }>;
}

const HEAD_CHARS = 160;
export const VALENTIN_DECIDES = 'Esto lo decide Valentín: pedíselo.';

type Member = [number, AgentState];

function head(text: string | undefined): string | undefined {
  const line = text
    ?.trim()
    .split('\n')
    .find((l) => l.trim());
  if (!line) return undefined;
  return line.length > HEAD_CHARS ? `${line.slice(0, HEAD_CHARS)}…` : line;
}

export class SupervisorTools {
  constructor(
    protected readonly deps: ToolDeps,
    protected readonly supervisorId: number,
  ) {}

  protected members(): Member[] {
    return this.deps.registry.members(this.supervisorId);
  }

  protected pendingOf(agent: AgentState): PendingPermission[] {
    return (this.deps.broker?.pending() ?? []).filter((p) => p.sessionId === agent.sessionId);
  }

  /** One of its agents by id or name (exact first, then a unique partial match). */
  find(query: string): Member | string {
    const members = this.members();
    const q = query.trim().replace(/^«|»$/g, '').toLowerCase();
    if (!q) return 'Decime a qué agente: su nombre o su id.';
    const byId = members.find(([id]) => String(id) === q);
    if (byId) return byId;
    const exact = members.filter(([, a]) => spokenName(a).toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const partial = members.filter(([, a]) => spokenName(a).toLowerCase().includes(q));
    if (partial.length === 1) return partial[0];
    const names = members.map(([id, a]) => `«${spokenName(a)}» (id ${id})`).join(', ');
    return partial.length > 1 || exact.length > 1
      ? `Hay más de uno que coincide con «${query}»: usá el id. Tu equipo: ${names || 'nadie'}.`
      : `«${query}» no está en tu equipo. Tu equipo: ${names || 'nadie todavía'}.`;
  }

  equipo(): string {
    const members = this.members();
    if (members.length === 0) return 'Todavía no tenés agentes a cargo.';
    return members
      .map(([id, agent]) => {
        const pending = this.pendingOf(agent);
        const state = teamState(id, agent, pending.length, this.deps.store).words;
        const doing = [...agent.activeToolStatuses.values()].at(-1);
        const folder = agent.cwd?.split(/[\\/]/).pop();
        const parts = [
          `«${spokenName(agent)}» (id ${id})`,
          state,
          folder ? `carpeta ${folder}` : undefined,
          doing ? `ahora: ${doing}` : undefined,
          head(agent.lastReply) ? `dijo: ${head(agent.lastReply)}` : undefined,
          agent.officeTerminal ? undefined : this.outsideNote(),
        ].filter(Boolean);
        const asks = pending.map(
          (p) =>
            `\n  permiso pendiente ${p.requestId}: ${describeRequest(p.toolName, p.toolInput)}`,
        );
        return `- ${parts.join(' · ')}${asks.join('')}`;
      })
      .join('\n');
  }

  ultimaRespuesta(query: string): string {
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [, agent] = found;
    return agent.lastReply?.trim() || `«${spokenName(agent)}» todavía no respondió nada.`;
  }

  /** The pending request, only if it belongs to one of its agents. */
  private request(requestId: string): { request: PendingPermission; agent: AgentState } | string {
    const request = (this.deps.broker?.pending() ?? []).find(
      (p) => p.requestId === requestId.trim(),
    );
    if (!request) return 'Ese permiso ya no está pendiente (se respondió o venció).';
    const member = this.members().find(([, a]) => a.sessionId === request.sessionId);
    if (!member) return 'Ese permiso no es de un agente de tu equipo.';
    return { request, agent: member[1] };
  }

  aprobarPermiso(requestId: string): string {
    const found = this.request(requestId);
    if (typeof found === 'string') return found;
    const { request, agent } = found;
    const verdict = supervisorMayApprove(
      request.toolName,
      request.toolInput,
      request.cwd ?? agent.cwd,
    );
    if (!verdict.ok) return `${VALENTIN_DECIDES} (${verdict.reason}). El permiso sigue pendiente.`;
    return this.deps.broker?.decide(request.requestId, { behavior: 'allow' })
      ? `Aprobado: «${spokenName(agent)}» puede seguir con ${describeRequest(request.toolName, request.toolInput)}.`
      : 'Ese permiso ya no está pendiente (se respondió o venció).';
  }

  rechazarPermiso(requestId: string, motivo?: string): string {
    const found = this.request(requestId);
    if (typeof found === 'string') return found;
    const { request, agent } = found;
    const message = motivo?.trim() || 'Lo rechazó su supervisor.';
    return this.deps.broker?.decide(request.requestId, { behavior: 'deny', message })
      ? `Rechazado: se lo dije a «${spokenName(agent)}».`
      : 'Ese permiso ya no está pendiente (se respondió o venció).';
  }

  /** How `equipo` marks an agent whose terminal is not the office's. */
  protected outsideNote(): string {
    return 'sin terminal en la oficina (no le podés escribir)';
  }

  /** The answer when the office cannot type into an agent's terminal. */
  protected noTerminal(name: string): string {
    return `«${name}» no tiene su terminal en la oficina: no le puedo escribir. Pedile a Valentín que lo traiga.`;
  }

  /** How the supervisor signs what it writes to its agents. */
  protected signature(): string {
    const me = this.deps.store.get(this.supervisorId);
    return `[Supervisor «${me ? spokenName(me) : 'tu supervisor'}»]`;
  }

  escribirAAgente(query: string, mensaje: string): string {
    const text = mensaje.trim();
    if (!text) return 'El mensaje está vacío.';
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [id, agent] = found;
    const terminal = this.deps.terminalOf(id);
    if (!terminal) return this.noTerminal(spokenName(agent));
    sendToTerminal(terminal, `${this.signature()} ${text}`);
    this.wrote(agent, text);
    return `Listo: se lo escribí a «${spokenName(agent)}».`;
  }

  /** After a message reached one of its agents (Jarvis notes it down). */
  protected wrote(_agent: AgentState, _text: string): void {}

  /** Where it may open agents: what lands in its scope (supervisorLaunch.ts). */
  private places(me: AgentState, scope: SupervisionScope): LaunchPlaces {
    const live = [...this.deps.store.values()].flatMap((a) => (a.cwd ? [a.cwd] : []));
    return {
      scope,
      workspaceFolders: this.deps.registry.folders.all()[me.sessionId],
      teamFolders: [me, ...this.members().map(([, a]) => a)].flatMap((a) => (a.cwd ? [a.cwd] : [])),
      knownFolders: [...(this.deps.folders?.() ?? []).map((f) => f.path), ...live],
    };
  }

  /** The new agent's task, nickname, model and effort, or why one does not do. */
  private launchChoice(input: LaunchInput): Omit<AgentLaunch, 'directoryPath'> | string {
    const prompt = input.tarea.trim();
    if (!prompt) return 'Falta la tarea: es el primer mensaje que le llega al agente.';
    if (prompt.length > LAUNCH_PROMPT_MAX_LENGTH) {
      return `La tarea es muy larga (máximo ${LAUNCH_PROMPT_MAX_LENGTH} caracteres): resumila y pasale el resto después con escribir_a_agente.`;
    }
    const nickname = input.apodo.trim().replace(/^«|»$/g, '');
    if (!nickname) return 'Falta el apodo: uno corto y fácil de decir.';
    if (nickname.length > NICKNAME_MAX) return `El apodo es muy largo (máximo ${NICKNAME_MAX}).`;
    const taken = [...this.deps.store.values()].some(
      (a) =>
        a.leadAgentId === undefined &&
        !a.spawnToolUseId &&
        spokenName(a).toLowerCase() === nickname.toLowerCase(),
    );
    if (taken) return `Ya hay un agente «${nickname}»: elegí otro apodo.`;
    const model = cleanModel(input.modelo);
    if (input.modelo?.trim() && !model) {
      return `No conozco el modelo «${input.modelo}» (usá ${MODEL_ALIASES.join(', ')}).`;
    }
    const effort = cleanEffort(input.esfuerzo);
    if (input.esfuerzo?.trim() && !effort) {
      return `No conozco el esfuerzo «${input.esfuerzo}» (usá ${EFFORT_LEVELS.join(', ')}).`;
    }
    return { prompt, nickname, model, effort };
  }

  /** A new office agent for one task, on its team: in a folder of its scope,
   *  with the task as its first message, within LAUNCHED_ALIVE_MAX. */
  async lanzarAgente(input: LaunchInput): Promise<string> {
    const me = this.deps.store.get(this.supervisorId);
    if (!me?.supervision) return 'Ya no sos supervisor: no puedo abrir agentes por vos.';
    if (!this.deps.launch) return 'Esta oficina no puede abrir agentes (no tiene terminales).';
    const choice = this.launchChoice(input);
    if (typeof choice === 'string') return choice;
    const alive = this.deps.registry.launchedAlive(me);
    if (alive >= LAUNCHED_ALIVE_MAX) {
      return `Ya tenés ${alive} agentes abiertos por vos andando y el tope es ${LAUNCHED_ALIVE_MAX}. Cerrá con cerrar_agente alguno que haya terminado, o pedíselo a Valentín.`;
    }
    const place = launchFolder(input.carpeta, this.places(me, me.supervision));
    if (!place.ok) return place.reason;

    const landed = this.deps.registry.beginLaunch(me.sessionId);
    let id: number | null;
    try {
      id = await this.deps.launch({ ...choice, directoryPath: place.path });
    } catch (err) {
      id = null;
      console.error(`[Pixel Agents] Supervisor launch in ${place.path}: ${String(err)}`);
    } finally {
      landed();
    }
    if (id === null) {
      return `No pude abrir a «${choice.nickname}» en ${place.path}: la oficina muestra el motivo.`;
    }
    const agent = this.deps.store.get(id);
    if (agent) {
      this.deps.registry.noteLaunched(me, agent.sessionId);
      broadcastSupervision(this.deps.store);
    }
    return `Listo: abrí a «${choice.nickname}» (id ${id}) en ${place.path} con su tarea. Ya está en tu equipo: la oficina te avisa cuando pida algo o termine.`;
  }

  /** Close one of its agents, only when it finished or has nothing to do. */
  cerrarAgente(query: string): string {
    if (!this.deps.close) return 'Esta oficina no puede cerrar agentes.';
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [id, agent] = found;
    const name = spokenName(agent);
    if (!agent.officeTerminal) {
      return `«${name}» corre afuera de la oficina (VS Code u otra terminal): a ese lo cierra Valentín.`;
    }
    const state = teamState(id, agent, this.pendingOf(agent).length, this.deps.store);
    if (state.kind === 'needs') {
      return `No lo cierro: «${name}» ${state.words}. Resolvelo primero, o traéselo a Valentín.`;
    }
    if (state.kind === 'work') {
      return `No lo cierro: «${name}» está ${state.words}. Cerralo cuando termine.`;
    }
    const left = agent.yourTurn && !agent.yourTurn.merged ? agent.yourTurn.text : undefined;
    if (!this.deps.close(id)) return `No pude cerrar a «${name}».`;
    return left
      ? `Cerré a «${name}» (su conversación queda guardada). Le había dejado a Valentín: «Te toca: ${left}» (si todavía no se lo pasaste, pasáselo).`
      : `Cerré a «${name}». Su conversación queda guardada.`;
  }
}
