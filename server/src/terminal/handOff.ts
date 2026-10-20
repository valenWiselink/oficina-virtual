import { spokenName } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { PtySessionManager } from './ptySessionManager.js';

/** Longest answer handed over; beyond this the target gets the tail-less head
 *  plus a note, so a huge report cannot flood its prompt. */
export const HAND_OFF_MAX_CHARS = 8000;

/** Bracketed paste: the TUI takes the whole block as typed text, newlines
 *  included, instead of submitting at the first line break. */
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

export type HandOffResult = { ok: true } | { ok: false; reason: string };

/** The text the target agent receives. */
export function handOffText(fromName: string, reply: string): string {
  // No escape bytes from the answer may reach the terminal: an ESC[201~ in
  // it would end the paste early and turn the rest into keystrokes.
  const clean = reply.replace(/\x1b/g, '');
  const body =
    clean.length > HAND_OFF_MAX_CHARS
      ? `${clean.slice(0, HAND_OFF_MAX_CHARS)}\n\n[… recortado: la respuesta completa es más larga]`
      : clean;
  return `Te paso lo último que respondió «${fromName}»:\n\n${body}`;
}

/**
 * "Take what this one did and carry on": paste agent `fromId`'s latest answer
 * into agent `toId`'s terminal — written, NOT sent, so the user can add an
 * instruction and press Enter. Only agents whose terminal lives in the office
 * can receive (an external terminal is not ours to type into).
 */
export function handOff(
  store: AgentStateStore,
  ptyManager: PtySessionManager | undefined,
  fromId: number,
  toId: number,
): HandOffResult {
  const from = store.get(fromId);
  const session = ptyManager?.get(toId);
  if (!from || !store.has(toId) || fromId === toId) return { ok: false, reason: 'Agente inválido' };
  if (!session) {
    return { ok: false, reason: 'Ese agente no tiene su terminal en la oficina' };
  }
  if (!from.lastReply) return { ok: false, reason: 'Ese agente todavía no respondió nada' };
  session.write(`${PASTE_START}${handOffText(spokenName(from), from.lastReply)}${PASTE_END}`);
  return { ok: true };
}

/** How long after the paste the Enter goes: the TUI must have taken the paste. */
const ENTER_AFTER_MS = 80;

/**
 * Write a message into an agent's terminal and send it (bracketed paste, then
 * Enter): how the office talks to a supervisor and a supervisor to its
 * agents. If the agent is mid-turn, Claude Code queues it for after.
 */
export function sendToTerminal(session: { write(data: string): void }, text: string): void {
  // Line breaks as \r, the way xterm.js sends a paste: Windows' console drops
  // a bare \n, which glued the lines together (measured 2026-10-20).
  const clean = text.replace(/\x1b/g, '').replace(/\r?\n/g, '\r');
  session.write(`${PASTE_START}${clean}${PASTE_END}`);
  setTimeout(() => session.write('\r'), ENTER_AFTER_MS);
}
