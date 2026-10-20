/**
 * How an agent's model and effort show on its Clawd: a bigger model is a
 * bigger Clawd (his bubble grows with him), and more effort shows as a
 * headband, a drop of sweat and, at the top, a flame around his bubble.
 * Pure, so it is tested without a canvas.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The effort a session reports ("high"), or undefined when it says nothing known. */
export function effortLevel(effort: string | undefined): EffortLevel | undefined {
  const e = effort?.trim().toLowerCase();
  return EFFORTS.find((x) => x === e);
}

/** How many marks the effort earns: 0 none, 1 headband, 2 + sweat, 3 + flame. */
export function effortMarks(effort: EffortLevel | undefined): 0 | 1 | 2 | 3 {
  if (effort === 'max') return 3;
  if (effort === 'xhigh') return 2;
  if (effort === 'high') return 1;
  return 0;
}

/** Size of the Clawd and his bubble by model family (unknown: as is). */
export function modelScale(model: string | undefined): number {
  const id = model?.toLowerCase() ?? '';
  if (id.includes('fable')) return 1.28;
  if (id.includes('opus')) return 1.14;
  if (id.includes('haiku')) return 0.84;
  return 1;
}
