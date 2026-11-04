import type { Meeting, UpcomingMeetings } from '../../../core/src/messages.js';
import { type CalendarQuery, queryCalendar } from './calendarQuery.js';
import { toMeetings } from './meetings.js';

export const CALENDAR_POLL_MS = 5 * 60_000;
const RETRY_MS = 60_000;
/** Without the connector: often enough to notice it was connected. */
const OFF_POLL_MS = 15 * 60_000;
/** Attempts that fail in a row before the slow pace. */
const QUICK_RETRIES = 3;
/** The connector said it is gone this many times in a row: hide the panel. */
const OFF_TO_HIDE = 2;
/** Failing for this long: what the panel shows can no longer be trusted. */
export const CALENDAR_STALE_MS = 30 * 60_000;

interface CalendarWatchDeps {
  broadcast: (message: UpcomingMeetings) => void;
  query?: CalendarQuery;
  now?: () => number;
}

/**
 * The next meetings for the offices, only in memory. Polls while a tokened
 * page is open. `connected: false` (the panel does not exist) until a read
 * worked: with no connector nothing shows and nothing is asked of anyone.
 */
export class CalendarWatch {
  private readonly query: CalendarQuery;
  private readonly now: () => number;
  private connected = false;
  private meetings: Meeting[] = [];
  private lastOk = 0;
  private failures = 0;
  private offCount = 0;
  private clients = 0;
  private dueAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /** A run reached the model: reading the calendar must never spend the plan. */
  private halted = false;

  constructor(private readonly deps: CalendarWatchDeps) {
    this.query = deps.query ?? queryCalendar;
    this.now = deps.now ?? Date.now;
  }

  message(): UpcomingMeetings {
    return { type: 'upcomingMeetings', connected: this.connected, meetings: this.meetings };
  }

  clientJoined(): void {
    this.clients += 1;
    if (this.clients === 1) this.schedule(Math.max(0, this.dueAt - this.now()));
  }

  clientLeft(): void {
    this.clients = Math.max(0, this.clients - 1);
    if (this.clients === 0) this.clearTimer();
  }

  stop(): void {
    this.clients = 0;
    this.clearTimer();
  }

  /** One read; the next one is scheduled from what it found. */
  async poll(): Promise<void> {
    if (this.running || this.halted) return;
    this.running = true;
    let wait: number;
    try {
      wait = this.absorb(await this.query());
    } catch {
      wait = this.failed('retry');
    } finally {
      this.running = false;
    }
    if (this.halted) return;
    this.dueAt = this.now() + wait;
    if (this.clients > 0) this.schedule(wait);
  }

  private absorb(answer: Awaited<ReturnType<CalendarQuery>>): number {
    if (answer.modelUsed) {
      this.halted = true;
      console.warn('[Pixel Agents] Calendar read reached the model: reading stopped until restart');
    }
    if (answer.kind !== 'events') return this.failed(answer.kind);
    this.failures = 0;
    this.offCount = 0;
    this.lastOk = this.now();
    this.publish(true, toMeetings(answer.events, this.now()));
    return CALENDAR_POLL_MS;
  }

  private failed(kind: 'off' | 'retry'): number {
    this.failures += 1;
    this.offCount = kind === 'off' ? this.offCount + 1 : 0;
    // A blip keeps what is on screen; the page drops meetings as they end.
    if (this.offCount >= OFF_TO_HIDE || this.now() - this.lastOk > CALENDAR_STALE_MS) {
      this.publish(false, []);
    }
    if (this.failures >= QUICK_RETRIES) return OFF_POLL_MS;
    return this.connected ? CALENDAR_POLL_MS : RETRY_MS;
  }

  private publish(connected: boolean, meetings: Meeting[]): void {
    const changed =
      connected !== this.connected || JSON.stringify(meetings) !== JSON.stringify(this.meetings);
    this.connected = connected;
    this.meetings = meetings;
    if (changed) this.deps.broadcast(this.message());
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.poll(), delay);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
