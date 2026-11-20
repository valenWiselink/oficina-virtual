import type { AgentView } from './agentViews.js';
import type { OfficeView } from './useOfficeView.js';

/**
 * Only the agents that run in the office (in one of its own terminals).
 * Sessions from VS Code or the desktop app stay on the board and in Jarvis's
 * `equipo`, not on the screens built around the office: there were many,
 * and old (2026-11-16), and the office cannot bring them in.
 */
export function inOfficeOnly<T extends Pick<AgentView, 'canSetRun'>>(views: readonly T[]): T[] {
  return views.filter((v) => v.canSetRun);
}

/**
 * The screens that show only the office's own agents: Núcleo, the graph and
 * the Asistente. The board keeps everyone (2026-11-20).
 */
export function showsOfficeOnly(view: OfficeView): boolean {
  return view !== 'tablero';
}
