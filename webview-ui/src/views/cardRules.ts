import type { ReplyChoices } from '../../../core/src/messages.js';
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

/** One button per option of its answer, plus "Como recomendás" when it
 *  recommended something: what each writes, and the hint on hover. */
export interface ChoiceButton {
  key: string;
  label: string;
  text: string;
  title: string;
}

export function choiceButtons(choices: ReplyChoices | undefined): ChoiceButton[] {
  if (!choices) return [];
  const buttons = choices.options.map((o) => ({
    key: `n${o.n}`,
    label: `${o.n} · ${o.label}`,
    text: `Andá con la ${o.n}.`,
    title: `Le escribe: «Andá con la ${o.n}.» (${o.label})`,
  }));
  if (choices.recommends) {
    const text = 'Dale, andá como recomendás.';
    buttons.push({ key: 'rec', label: 'Como recomendás', text, title: `Le escribe: «${text}»` });
  }
  return buttons;
}

export function offersCompact(v: AgentView, writable: boolean): boolean {
  return writable && v.contextPct !== undefined && v.contextPct >= COMPACT_FROM_PCT && !v.blocking;
}

export function isImpatient(v: AgentView, now: number): boolean {
  return (
    v.kind === 'needs' && v.waitingSince !== undefined && now - v.waitingSince > IMPATIENT_AFTER_MS
  );
}
