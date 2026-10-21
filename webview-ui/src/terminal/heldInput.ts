/** How long a whole message sent to a terminal that is reconnecting waits. */
export const INPUT_HOLD_MS = 30_000;

/** Told whether a write reached the agent's terminal. */
export type WriteDone = (sent: boolean) => void;

export interface Held<T> {
  item: T;
  done: WriteDone;
}

/**
 * Whole messages (sendToAgent: the chat, quick replies, a message to several)
 * sent while a terminal is not attached — reconnecting after a drop, a
 * restart, a relaunch: kept in order for the next attach, or dropped when it
 * stays away past the hold. Keys typed by hand are never kept (see
 * TerminalConnection.write): late, they could answer another question.
 */
export class HeldMessages<T> {
  private items: Array<Held<T>> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onExpire: () => void;
  private readonly holdMs: number;

  /** `onExpire` runs when the hold ran out and something was dropped. */
  constructor(onExpire: () => void, holdMs = INPUT_HOLD_MS) {
    this.onExpire = onExpire;
    this.holdMs = holdMs;
  }

  /** Keep it; the hold runs from the oldest one kept. */
  hold(item: T, done: WriteDone): void {
    this.items.push({ item, done });
    this.timer ??= setTimeout(() => {
      if (this.drop()) this.onExpire();
    }, this.holdMs);
  }

  /** The terminal is back: everything kept, oldest first (the caller sends
   *  each and settles its `done`). */
  take(): Array<Held<T>> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const items = this.items;
    this.items = [];
    return items;
  }

  /** It is not coming back: throw it all away and say it did not go.
   *  True when there was something to drop. */
  drop(): boolean {
    const items = this.take();
    for (const held of items) held.done(false);
    return items.length > 0;
  }
}
