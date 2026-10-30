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
  noteDraft(agentId, data, at);
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
  drafts.clear();
}

/**
 * What you are writing in an agent's terminal and have not sent yet: the
 * office must not paste its own message over it, or its Enter sends your
 * half-written line glued to it («no hace falt» + «[Oficina] …», 2026-10-30).
 * Typed text or a paste opens it; Enter or Ctrl+C closes it. Keys that only
 * move (arrows, focus reports) say nothing. Deleting it with Backspace still
 * counts as writing: DRAFT_HOLD_MS after the last key it stops holding.
 */
export const DRAFT_HOLD_MS = 60_000;

const drafts = new Map<number, number>();

function noteDraft(agentId: number, data: string, at: number): void {
  if (/[\r\n\x03]$/.test(data)) {
    drafts.delete(agentId);
    return;
  }
  const paste = data.startsWith('\x1b[200~');
  const writes = !data.startsWith('\x1b') && /[^\x00-\x1f]|[\b]/.test(data);
  if (paste || writes) drafts.set(agentId, at);
}

/** Whether you are in the middle of writing to `agentId` in its terminal. */
export function isDrafting(agentId: number, now = Date.now()): boolean {
  const at = drafts.get(agentId);
  return at !== undefined && now - at < DRAFT_HOLD_MS;
}
