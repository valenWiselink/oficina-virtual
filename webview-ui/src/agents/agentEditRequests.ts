import type { ClientMessage, ServerMessage } from '../../../core/src/messages.js';
import type { SupervisionScope } from './supervisionRules.js';

/**
 * "Editar agente" requests, DOM-free so they test without a socket
 * (agentEdits.ts wires them to the real transport): rename and recolour any
 * agent, and another model or effort for one in an office terminal (the
 * server relaunches it with --resume; see server/src/agentEdits.ts).
 */

/** The slice of the transport these requests use. */
export interface EditLink {
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): () => void;
}

export interface RunChoice {
  /** null = Claude Code's default ("Como siempre"). */
  model: string | null;
  effort: string | null;
}

export type RunAnswer = { ok: boolean; reason?: string; newId?: number };

export const RUN_TIMEOUT_MS = 30_000;

export const MODEL_CHOICES: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: 'Como siempre' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'fable', label: 'Fable' },
];

export const EFFORT_CHOICES: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: 'Como siempre' },
  { value: 'low', label: 'Bajo' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
  { value: 'xhigh', label: 'Muy alto' },
  { value: 'max', label: 'Máximo' },
];

export function makeAgentEdits(link: EditLink, timeoutMs = RUN_TIMEOUT_MS) {
  /** Rename ('' clears the name) and/or recolour; every office hears back. */
  const editAgent = (id: number, change: { nickname?: string; palette?: number }): void => {
    link.send({ type: 'editAgent', id, ...change });
  };

  /** Send a request answered by one `answerType` message for this agent;
   *  resolves with it, or with a timeout after `timeoutMs`. */
  const ask = (answerType: string, id: number, request: ClientMessage): Promise<RunAnswer> =>
    new Promise((resolve) => {
      let done = false;
      const finish = (answer: RunAnswer) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        stop();
        resolve(answer);
      };
      const stop = link.onMessage((msg) => {
        const m = msg as {
          type: string;
          id?: number;
          ok?: boolean;
          reason?: string;
          newId?: number;
        };
        if (m.type === answerType && m.id === id) {
          finish({ ok: m.ok === true, reason: m.reason, newId: m.newId });
        }
      });
      const timer = setTimeout(
        () => finish({ ok: false, reason: 'No respondió a tiempo' }),
        timeoutMs,
      );
      link.send(request);
    });

  /** Relaunch with this model and effort; resolves with the server's answer. */
  const setAgentRun = (id: number, choice: RunChoice): Promise<RunAnswer> =>
    ask('agentRunResult', id, {
      type: 'setAgentRun',
      id,
      model: choice.model,
      effort: choice.effort,
    });

  /** Make it a supervisor of a workspace, chosen agents or everyone (or no
   *  longer one): relaunched on the same conversation with the office's tools. */
  const setSupervision = (id: number, scope: SupervisionScope): Promise<RunAnswer> =>
    ask('supervisionResult', id, { type: 'setSupervision', id, scope });

  /** Who its team is (session ids), for workspaces and hand-picked teams; a
   *  workspace's also says which folders land in it (where it may launch). */
  const sendTeam = (supervisorId: number, members: string[], folders?: string[]): void => {
    link.send({ type: 'supervisionTeam', supervisorId, members, folders });
  };

  return { editAgent, setAgentRun, setSupervision, sendTeam };
}
