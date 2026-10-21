/** How long what you write to a terminal that is reconnecting waits for it. */
export const INPUT_HOLD_MS = 30_000;

/** Told whether a write reached the agent's terminal. */
export type WriteDone = (sent: boolean) => void;

interface Held {
  data: string;
  done?: WriteDone;
}

/**
 * Input written while a terminal is not attached (reconnecting after a drop,
 * a restart, a relaunch): kept in order and sent whole once it attaches
 * again, or dropped whole when it stays away past the hold — the tail of
 * what you typed without its start would mean something else.
 */
export class HeldInput {
  private items: Held[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onExpire: () => void;
  private readonly holdMs: number;

  /** `onExpire` runs when the hold ran out and something was dropped. */
  constructor(onExpire: () => void, holdMs = INPUT_HOLD_MS) {
    this.onExpire = onExpire;
    this.holdMs = holdMs;
  }

  /** Keep it; the hold runs from the oldest thing kept. */
  hold(data: string, done?: WriteDone): void {
    this.items.push({ data, done });
    this.timer ??= setTimeout(() => {
      if (this.drop()) this.onExpire();
    }, this.holdMs);
  }

  /** The terminal is back: write everything, oldest first, and say it went. */
  release(write: (data: string) => void): void {
    const items = this.take();
    for (const item of items) write(item.data);
    for (const item of items) item.done?.(true);
  }

  /** It is not coming back: throw it all away and say it did not go.
   *  True when there was something to drop. */
  drop(): boolean {
    const items = this.take();
    for (const item of items) item.done?.(false);
    return items.length > 0;
  }

  private take(): Held[] {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const items = this.items;
    this.items = [];
    return items;
  }
}
