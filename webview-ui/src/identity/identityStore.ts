import type { AgentIdentity, AgentTask } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * Latest identity per agent (nickname, title, ticket, cwd, tasks), as the
 * server last reported it. Kept outside the characters so an identity that
 * arrives before its character exists is not lost, and read every frame by
 * the overlay like the rest of the office state.
 */
const identities = new Map<number, AgentIdentity>();

transport.onMessage((msg) => {
  if (msg.type === 'agentIdentity') identities.set(msg.id, msg);
  else if (msg.type === 'agentClosed') identities.delete(msg.id);
});

/** A supervisor watches over it: its pings go through the supervisor. */
export function isSupervised(id: number | undefined): boolean {
  return id !== undefined && (identities.get(id)?.supervisedBy?.length ?? 0) > 0;
}

export function getIdentity(id: number): AgentIdentity | undefined {
  return identities.get(id);
}

function folderName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).filter(Boolean).pop();
}

/** Clip to `max` characters with an ellipsis (labels are one line). */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const NAME_MAX_CHARS = 28;

/**
 * The name the office shows for an agent: the nickname given at launch, else
 * the session title, else its folder, else the Directory it came from. Every
 * option is something the session really has — never an invented name.
 */
export function displayName(
  id: number,
  fallback: { agentName?: string; directoryName?: string },
): string | undefined {
  const identity = identities.get(id);
  const name =
    identity?.nickname ??
    identity?.title ??
    fallback.agentName ??
    folderName(identity?.cwd) ??
    fallback.directoryName;
  return name ? clip(name, NAME_MAX_CHARS) : undefined;
}

/** The task the agent is on right now, if it keeps a task list. */
export function currentTask(id: number): AgentTask | undefined {
  return identities.get(id)?.tasks.find((t) => t.status === 'in_progress');
}

/** "3/7" over the agent's task list, or undefined without one. */
export function taskProgress(id: number): string | undefined {
  const tasks = identities.get(id)?.tasks ?? [];
  if (tasks.length === 0) return undefined;
  return `${tasks.filter((t) => t.status === 'completed').length}/${tasks.length}`;
}

/** Second line under the name: ticket, task progress and folder, when known
 *  and not already the name itself. */
export function identityDetails(id: number, shownName: string | undefined): string {
  const identity = identities.get(id);
  const folder = folderName(identity?.cwd);
  const parts = [
    identity?.ticket,
    taskProgress(id),
    folder && folder !== shownName ? folder : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}
