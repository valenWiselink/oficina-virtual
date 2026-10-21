import type { AgentView } from './agentViews.js';
import {
  ARRIVE_MS,
  burstHop,
  recentClicks,
  type Trick,
  TRICK_CLICKS,
  TRICK_MS,
  TRICKS,
  WAVE_MS,
  WAVE_STAGGER_MS,
} from './clawdTricks.js';

/** Still this long (by its session's own records) and without a task: asleep. */
export const SLEEP_AFTER_MS = 10 * 60_000;
/** At most one celebration per agent in this window. */
const PARTY_EVERY_MS = 2 * 60_000;
export const BURST_MS = 1400;
export const CHECK_MS = 1500;
export const HOP_MS = 360;
/** Coming back to the graph: everyone blinks together, this long. */
export const GLANCE_MS = 320;

/**
 * Clawd's little life on the graph — every bit of it tied to something true:
 * - asleep only in "Sin tarea", and only when the session's records say it
 *   has been still for a while (no record time: stays awake);
 * - a celebration (bounces and confetti) when you mark "Hecho" or it
 *   completes its whole task list, at most every 2 min, and never while
 *   anyone waits on you (it is kept for when "Te necesita" empties);
 * - a small ✓ when one task completes, a hop when you click it, a trick
 *   after five quick clicks;
 * - everyone waves the first time you open the graph in the day; coming back
 *   to it later they only blink together; an agent that shows up later pops in;
 * - how long each has been working without a break (for its coffee);
 * - the first state seen (page load, reconnect) is never an event.
 */
export class ClawdLife {
  private readonly seen = new Map<number, { completed: number; allDone: boolean }>();
  private readonly lastParty = new Map<number, number>();
  private readonly queued = new Set<number>();
  private readonly bursts = new Map<number, number>();
  private readonly checks = new Map<number, number>();
  private readonly hops = new Map<number, number>();
  private readonly clicks = new Map<number, number[]>();
  private readonly tricks = new Map<number, { trick: Trick; at: number }>();
  private readonly arrivals = new Map<number, number>();
  private readonly workingSince = new Map<number, number>();
  /** When it first saw anyone (what exists then is not news). */
  private firstSeenAt: number | null = null;
  private waveAt: number | null = null;
  private glanceAt: number | null = null;
  private nextTrick = 0;

  /** Compare with the last frame: completed tasks are news, first sight is not. */
  observe(views: AgentView[], now: number): void {
    const firstSight = this.firstSeenAt === null;
    if (firstSight && views.length > 0) this.firstSeenAt = now;
    for (const v of views) {
      const completed = v.tasks.filter((t) => t.status === 'completed').length;
      const allDone = v.tasks.length > 0 && completed === v.tasks.length;
      const before = this.seen.get(v.id);
      this.seen.set(v.id, { completed, allDone });
      this.trackWork(v, now);
      if (!before) {
        if (!firstSight) this.arrivals.set(v.id, now);
        continue;
      }
      if (allDone && !before.allDone) this.celebrate(v.id);
      else if (completed > before.completed) this.checks.set(v.id, now);
    }
    const anyWaiting = views.some((v) => v.kind === 'needs');
    if (!anyWaiting) this.release(now);
  }

  private trackWork(v: AgentView, now: number): void {
    if (v.kind === 'work' || v.kind === 'meet') {
      if (!this.workingSince.has(v.id)) this.workingSince.set(v.id, now);
    } else {
      this.workingSince.delete(v.id);
    }
  }

  /** Ask for a celebration (it may wait for the queue to empty). */
  celebrate(id: number): void {
    this.queued.add(id);
  }

  /** A click on it: a hop, and the fifth quick one starts a trick. The
   *  second click of a double click (`hop` false) only counts toward it. */
  greet(id: number, now: number, hop = true): void {
    if (hop) this.hops.set(id, now);
    const times = recentClicks(this.clicks.get(id) ?? [], now);
    if (times.length < TRICK_CLICKS) {
      this.clicks.set(id, times);
      return;
    }
    this.clicks.delete(id);
    this.tricks.set(id, { trick: TRICKS[this.nextTrick % TRICKS.length], at: now });
    this.nextTrick++;
  }

  private release(now: number): void {
    for (const id of this.queued) {
      const last = this.lastParty.get(id);
      if (last !== undefined && now - last < PARTY_EVERY_MS) continue;
      this.lastParty.set(id, now);
      this.bursts.set(id, now);
    }
    this.queued.clear();
  }

  /** 0..1 progress of a running celebration, or null. */
  burst(id: number, now: number): number | null {
    return progress(this.bursts.get(id), now, BURST_MS);
  }

  check(id: number, now: number): number | null {
    return progress(this.checks.get(id), now, CHECK_MS);
  }

  /** Pixels up right now: a click hop or a celebration's bounces (0 when none). */
  hop(id: number, now: number): number {
    const burst = this.burst(id, now);
    if (burst !== null) return burstHop(burst);
    const p = progress(this.hops.get(id), now, HOP_MS);
    return p === null ? 0 : Math.sin(p * Math.PI) * 2;
  }

  /** A double blink while hopping (the greeting). */
  blinking(id: number, now: number): boolean {
    const p = progress(this.hops.get(id), now, HOP_MS);
    return p !== null && (p < 0.2 || (p > 0.45 && p < 0.65));
  }

  /** The trick running now and its progress, or null. */
  trick(id: number, now: number): { trick: Trick; p: number } | null {
    const running = this.tricks.get(id);
    const p = progress(running?.at, now, TRICK_MS);
    return running && p !== null ? { trick: running.trick, p } : null;
  }

  /** The graph came on screen: the big wave (once a day, `wave`) or, coming
   *  back to it, a blink all together. */
  showGraph(now: number, wave: boolean): void {
    if (wave) this.waveAt = now;
    else this.glanceAt = now;
  }

  /** Waving hello (the index-th agent starts a little later). */
  waving(index: number, now: number): boolean {
    if (this.waveAt === null) return false;
    const start = this.waveAt + index * WAVE_STAGGER_MS;
    return now >= start && now - start < WAVE_MS;
  }

  /** Blinking together as you come back to the graph (a double blink). */
  glancing(now: number): boolean {
    const p = progress(this.glanceAt ?? undefined, now, GLANCE_MS);
    return p !== null && (p < 0.35 || (p > 0.6 && p < 0.95));
  }

  /** 0..1 progress of a new agent's arrival, or null. */
  arrival(id: number, now: number): number | null {
    return progress(this.arrivals.get(id), now, ARRIVE_MS);
  }

  /** How long it has been working without a break (0 when it is not). */
  workingFor(id: number, now: number): number {
    const since = this.workingSince.get(id);
    return since === undefined ? 0 : now - since;
  }
}

export function isAsleep(view: AgentView, now: number): boolean {
  return (
    view.kind === 'idle' &&
    view.lastRecordAt !== undefined &&
    now - view.lastRecordAt >= SLEEP_AFTER_MS
  );
}

function progress(start: number | undefined, now: number, span: number): number | null {
  if (start === undefined) return null;
  const p = (now - start) / span;
  return p >= 0 && p < 1 ? p : null;
}
