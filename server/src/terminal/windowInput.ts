/**
 * When the office window sent Enter to an agent's terminal: what the person
 * at the window typed or said (the bar, the voice, the terminal pane), as
 * opposed to what the office or a supervisor writes into it from the server
 * («[Oficina] …», «[Supervisor «X»] …»). Jarvis may approve a permission on
 * Valentín's word only if that word came this way (valentinConsent.ts).
 */

/** Enters remembered per agent: only the recent ones matter. */
const KEPT = 20;

const enters = new Map<number, number[]>();

/** Note what the window sent to agent `agentId` (terminalRoutes.ts). */
export function noteWindowInput(agentId: number, data: string, at = Date.now()): void {
  if (!/[\r\n]/.test(data)) return;
  const list = enters.get(agentId) ?? [];
  list.push(at);
  enters.set(agentId, list.slice(-KEPT));
}

/** The latest Enters the window sent to `agentId`, oldest first. */
export function windowEnters(agentId: number): readonly number[] {
  return enters.get(agentId) ?? [];
}

/** Tests only. */
export function forgetWindowInput(): void {
  enters.clear();
}
