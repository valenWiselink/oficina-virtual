import type { AgentView } from './agentViews.js';

/**
 * Pure pieces of Clawd's life on the graph (clawdLife.ts keeps the timers):
 * the easter-egg tricks, what he holds for what he is doing, and the motion
 * curves. No canvas here, so all of it is tested.
 */

/** Five clicks on the same Clawd within this window: a trick. */
export const TRICK_CLICKS = 5;
export const TRICK_WINDOW_MS = 2000;
export const TRICK_MS = 1800;
/** Working without a break this long earns a coffee. */
export const COFFEE_AFTER_MS = 30 * 60_000;
/** The page-open wave, and how much later each next agent starts it. */
export const WAVE_MS = 2500;
export const WAVE_STAGGER_MS = 180;
export const ARRIVE_MS = 700;

export type Trick = 'dance' | 'spin' | 'flip' | 'hearts' | 'dizzy' | 'jump';
/** In the order they come: each new trick is the next one. */
export const TRICKS: readonly Trick[] = ['dance', 'spin', 'flip', 'hearts', 'dizzy', 'jump'];

/** Click times kept for the count: only those inside the window, plus now. */
export function recentClicks(times: readonly number[], now: number): number[] {
  return [...times.filter((t) => now - t < TRICK_WINDOW_MS), now];
}

/** How a trick moves Clawd at progress p (0..1). Lift is in world px. */
export interface TrickMotion {
  rotate?: number;
  shiftX?: number;
  lift?: number;
  wave?: number;
  happy?: boolean;
}

const TAU = Math.PI * 2;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export function trickMotion(trick: Trick, p: number): TrickMotion {
  switch (trick) {
    case 'dance':
      return { shiftX: Math.sin(p * Math.PI * 8) * 3, wave: Math.floor(p * 10) % 2, happy: true };
    case 'spin':
      return { rotate: ease(p) * TAU };
    case 'flip':
      // Up, a full turn backwards at the top, down.
      return { lift: Math.sin(p * Math.PI) * 18, rotate: -ease(p) * TAU };
    case 'hearts':
      return { happy: true, lift: Math.abs(Math.sin(p * Math.PI * 4)) * 3 };
    case 'dizzy':
      return { rotate: Math.sin(p * Math.PI * 6) * 0.25 * (1 - p) };
    case 'jump':
      return { lift: Math.abs(Math.sin(p * Math.PI * 2)) * 24 * (1 - p * 0.4), happy: true };
  }
}

/** A celebration's bounces: three hops that settle (world px up). */
export function burstHop(p: number): number {
  return Math.abs(Math.sin(p * Math.PI * 3)) * 10 * (1 - p);
}

/** The nod when your message got to it and it set to work: two small dips
 *  of the head (world px down) with a blink at the bottom of each. */
export const NOD_MS = 420;
export function nodMotion(p: number): { lift: number; blink: boolean } {
  const dip = Math.abs(Math.sin(p * Math.PI * 2));
  return { lift: -dip * 2, blink: dip > 0.85 };
}

/** A new agent arriving: grows from small with an overshoot, and a hop. */
export function arrivalMotion(p: number): { scaleK: number; lift: number } {
  const c = 1.7;
  const back = 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
  return { scaleK: 0.25 + 0.75 * back, lift: Math.sin(p * Math.PI) * 8 };
}

/** What Clawd holds for what he is doing (it replaces the repo accessory). */
export type ActivityProp = 'glasses' | 'wrench' | 'coffee';

const BUILD_OR_TEST =
  /\b(test|tests|vitest|jest|pytest|build|compile|tsc|gradle|cargo|make|lint|flutter (?:test|build)|go (?:test|build|vet))\b/i;

/**
 * Running a build or tests, read from what its status line says it runs
 * ("Corriendo: npm test", "Esperando: build del webapp").
 */
export function isBuildOrTest(statusText: string): boolean {
  const m = /^(?:Corriendo|Esperando): (.*)$/.exec(statusText);
  return !!m && BUILD_OR_TEST.test(m[1]);
}

export function activityProp(
  view: Pick<AgentView, 'kind' | 'statusText'>,
  workingForMs: number,
): ActivityProp | undefined {
  if (view.kind === 'research') return 'glasses';
  if (view.kind !== 'work' && view.kind !== 'meet') return undefined;
  if (isBuildOrTest(view.statusText)) return 'wrench';
  return workingForMs >= COFFEE_AFTER_MS ? 'coffee' : undefined;
}
