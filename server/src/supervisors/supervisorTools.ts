/**
 * The office tools a supervisor gets over MCP (supervisorMcp.ts): see its
 * team, read an agent's last answer, approve or refuse a permission, write to
 * one of its agents. Everything is limited to its own team; approvals also
 * pass the office's guard (supervisorGuard.ts) whatever the supervisor says.
 * Answers are plain text in castellano, written for Claude to act on.
 */

import { spokenName } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { PendingPermission, PermissionBroker } from '../permissionBroker.js';
import { sendToTerminal } from '../terminal/handOff.js';
import type { AgentState } from '../types.js';
import type { SupervisorRegistry } from './supervision.js';
import { supervisorMayApprove } from './supervisorGuard.js';
import { describeRequest } from './supervisorRelay.js';

export interface ToolDeps {
  store: AgentStateStore;
  registry: SupervisorRegistry;
  broker?: Pick<PermissionBroker, 'pending' | 'decide'>;
  terminalOf: (id: number) => { write(data: string): void } | undefined;
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
    private readonly deps: ToolDeps,
    private readonly supervisorId: number,
  ) {}

  private members(): Member[] {
    return this.deps.registry.members(this.supervisorId);
  }

  private pendingOf(agent: AgentState): PendingPermission[] {
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
        const state =
          pending.length > 0
            ? 'te necesita (permiso)'
            : !agent.isWaiting
              ? 'trabajando'
              : agent.lastReply
                ? 'terminó su turno'
                : 'sin tarea';
        const doing = [...agent.activeToolStatuses.values()].at(-1);
        const folder = agent.cwd?.split(/[\\/]/).pop();
        const parts = [
          `«${spokenName(agent)}» (id ${id})`,
          state,
          folder ? `carpeta ${folder}` : undefined,
          doing ? `ahora: ${doing}` : undefined,
          head(agent.lastReply) ? `dijo: ${head(agent.lastReply)}` : undefined,
          agent.officeTerminal ? undefined : 'sin terminal en la oficina (no le podés escribir)',
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

  escribirAAgente(query: string, mensaje: string): string {
    const text = mensaje.trim();
    if (!text) return 'El mensaje está vacío.';
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [id, agent] = found;
    const terminal = this.deps.terminalOf(id);
    if (!terminal) {
      return `«${spokenName(agent)}» no tiene su terminal en la oficina: no le puedo escribir. Pedile a Valentín que lo traiga.`;
    }
    const me = this.deps.store.get(this.supervisorId);
    const from = me ? spokenName(me) : 'tu supervisor';
    sendToTerminal(terminal, `[Supervisor «${from}»] ${text}`);
    return `Listo: se lo escribí a «${spokenName(agent)}».`;
  }
}
