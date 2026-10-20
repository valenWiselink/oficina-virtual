import type { AgentView } from './agentViews.js';

/** From this context use on, the card offers "Compactar". */
export const COMPACT_FROM_PCT = 85;
/** Waiting on you longer than this, its Clawd gets impatient. */
export const IMPATIENT_AFTER_MS = 10 * 60_000;

/** One-tap answers for an agent that left you something or finished. */
export const QUICK_REPLIES: ReadonlyArray<{ label: string; text: string }> = [
  { label: 'Dale, seguí', text: 'Dale, seguí.' },
  { label: 'Hacé el PR', text: 'Hacé el PR.' },
  { label: 'Esperá', text: 'Esperá un momento, ahora te digo.' },
];

/**
 * Quick replies fit a finished turn or a "te toca": not a held permission or
 * a question (those block on their own prompt, where typed text would land in
 * the wrong place), and only where its terminal lives in this office.
 */
export function offersQuickReplies(v: AgentView, writable: boolean): boolean {
  if (!writable || v.blocking || v.permission) return false;
  return v.kind === 'done' || (v.kind === 'needs' && !!v.yourTurnId);
}

export function offersCompact(v: AgentView, writable: boolean): boolean {
  return writable && v.contextPct !== undefined && v.contextPct >= COMPACT_FROM_PCT && !v.blocking;
}

export function isImpatient(v: AgentView, now: number): boolean {
  return (
    v.kind === 'needs' && v.waitingSince !== undefined && now - v.waitingSince > IMPATIENT_AFTER_MS
  );
}
