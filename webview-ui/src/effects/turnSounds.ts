/**
 * Which sound a turn's end earns. The "te toca" of an answer lands within
 * ~100 ms of the turn's end, either side (measured 2026-10-20), so the choice
 * waits a moment: a question knocks on the door (it blocks the agent), a
 * turn that leaves you something gets the "te toca", and one that leaves
 * nothing gets a soft plin, at most one in a while however many finish (296
 * ends on 2026-10-20, 208 with nothing for you, 83 of them between 14 and 15 h).
 *
 * The office keeps quiet about what you already see: no plin for the agent
 * whose terminal or chat is in front of you, and while you type the plin and
 * the "te toca" wait, so that only one of them sounds when you stop. The door
 * never waits.
 */

/** How long after a turn ends its sound is chosen. */
export const DECIDE_AFTER_MS = 1_500;
/** At most one "terminó" plin in this long. */
export const PLIN_GAP_MS = 45_000;
/** Calls closer than this are one call (several needs at once). */
const CALL_GAP_MS = 3_000;
/** Right after the page opens, what is already there is not news. */
export const STARTUP_QUIET_MS = 8_000;
/** A key pressed this recently means you are typing. */
export const TYPING_QUIET_MS = 4_000;

export interface TurnSoundOutput {
  /** An agent is blocked until you answer (a question): the knock on the door. */
  door(): void;
  /** A finished turn left you something ("te toca"). */
  teToca(): void;
  /** A turn ended with nothing for you (every one, for focus mode's count). */
  finished(): void;
  /** The soft plin, already spaced out. */
  plin(): void;
}

/** What the office knows about you right now. */
export interface TurnSoundSignals {
  /** Whether this agent's terminal or chat is in front of you. */
  inView(agentId: number): boolean;
  /** When you last pressed a key in the office (ms, same clock as `now`). */
  lastKeyAt(): number;
}

export interface TurnSounds {
  /** An agent's turn just ended (once per turn). */
  turnEnded(agentId: number): void;
  /** Something new needs you from this agent: a "te toca" or a question. */
  needsYou(agentId: number, urgent: boolean): void;
  /** Still the first moments after the page opened. */
  starting(): boolean;
}

const NOBODY_WATCHING: TurnSoundSignals = { inView: () => false, lastKeyAt: () => -Infinity };

/** A sound that may wait for you to stop typing. */
type Waiting = 'plin' | 'teToca';

export function createTurnSounds(
  out: TurnSoundOutput,
  now = () => Date.now(),
  signals: TurnSoundSignals = NOBODY_WATCHING,
): TurnSounds {
  const openedAt = now();
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  const needAt = new Map<number, number>();
  let lastPlin = -Infinity;
  let lastDoor = -Infinity;
  let lastTeToca = -Infinity;
  const starting = () => now() - openedAt < STARTUP_QUIET_MS;
  const held = holdWhileTyping(out, now, signals);

  const cancel = (agentId: number) => {
    const timer = pending.get(agentId);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(agentId);
  };

  const decide = (agentId: number) => {
    pending.delete(agentId);
    if (starting()) return;
    out.finished();
    // Its terminal or chat is in front of you: you saw it end.
    if (signals.inView(agentId) || now() - lastPlin < PLIN_GAP_MS) return;
    lastPlin = now();
    held.sound('plin');
  };

  return {
    starting,
    turnEnded(agentId) {
      // Its "te toca" came first: that call already said it.
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
      if (starting()) return;
      if (urgent) {
        if (now() - lastDoor < CALL_GAP_MS) return;
        lastDoor = now();
        out.door();
        return;
      }
      // A knock a moment ago already called you.
      if (now() - Math.max(lastTeToca, lastDoor) < CALL_GAP_MS) return;
      lastTeToca = now();
      held.sound('teToca');
    },
  };
}

/** Plays a plin or a "te toca" now, or, while you type, keeps the one that
 *  matters most (the "te toca") and plays it once you have stopped typing. */
function holdWhileTyping(out: TurnSoundOutput, now: () => number, signals: TurnSoundSignals) {
  let waiting: Waiting | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const typing = () => now() - signals.lastKeyAt() < TYPING_QUIET_MS;

  const waitForQuiet = () => {
    timer = setTimeout(release, TYPING_QUIET_MS - (now() - signals.lastKeyAt()));
  };
  const release = () => {
    timer = undefined;
    if (typing()) return waitForQuiet();
    const kind = waiting;
    waiting = null;
    if (kind) out[kind]();
  };

  return {
    sound(kind: Waiting) {
      if (!typing()) return out[kind]();
      if (waiting !== 'teToca') waiting = kind;
      if (timer === undefined) waitForQuiet();
    },
  };
}
