/**
 * Which sound a turn's end earns. The "te toca" of an answer lands within
 * ~100 ms of the turn's end, either side (measured 2026-10-20), so the choice
 * waits a moment: a turn that leaves you something knocks (the toc-toc, as a
 * permission does); one that leaves nothing gets a soft plin, at most one in
 * a while however many finish (296 ends on 2026-10-20, 208 with nothing for
 * you, 83 of them between 14 and 15 h).
 */

/** How long after a turn ends its sound is chosen. */
export const DECIDE_AFTER_MS = 1_500;
/** At most one "terminó" plin in this long. */
export const PLIN_GAP_MS = 45_000;
/** Knocks closer than this are one knock (several needs at once). */
const KNOCK_GAP_MS = 3_000;
/** Right after the page opens, what is already there is not news. */
export const STARTUP_QUIET_MS = 8_000;

export interface TurnSoundOutput {
  /** Something needs you; `urgent` when it blocks the agent (a question). */
  knock(urgent: boolean): void;
  /** A turn ended with nothing for you (every one, for focus mode's count). */
  finished(): void;
  /** The soft plin, already spaced out. */
  plin(): void;
}

export interface TurnSounds {
  /** An agent's turn just ended (once per turn). */
  turnEnded(agentId: number): void;
  /** Something new needs you from this agent: a "te toca" or a question. */
  needsYou(agentId: number, urgent: boolean): void;
  /** Still the first moments after the page opened. */
  starting(): boolean;
}

export function createTurnSounds(out: TurnSoundOutput, now = () => Date.now()): TurnSounds {
  const openedAt = now();
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  const needAt = new Map<number, number>();
  let lastPlin = -Infinity;
  let lastKnock = -Infinity;
  const starting = () => now() - openedAt < STARTUP_QUIET_MS;

  const cancel = (agentId: number) => {
    const timer = pending.get(agentId);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(agentId);
  };

  const decide = (agentId: number) => {
    pending.delete(agentId);
    if (starting()) return;
    out.finished();
    if (now() - lastPlin < PLIN_GAP_MS) return;
    lastPlin = now();
    out.plin();
  };

  return {
    starting,
    turnEnded(agentId) {
      // Its "te toca" came first: that knock already said it.
      if (now() - (needAt.get(agentId) ?? -Infinity) < DECIDE_AFTER_MS) return;
      cancel(agentId);
      pending.set(
        agentId,
        setTimeout(() => decide(agentId), DECIDE_AFTER_MS),
      );
    },
    needsYou(agentId, urgent) {
      needAt.set(agentId, now());
      cancel(agentId);
      if (starting() || now() - lastKnock < KNOCK_GAP_MS) return;
      lastKnock = now();
      out.knock(urgent);
    },
  };
}
