/**
 * How an agent's model and effort show on its Clawd. Each model family has
 * its own look: a bigger Clawd and bubble, a body that evolves (hatchling,
 * classic, claws, legend), a material (paper, plush, metal, hologram) and a
 * bubble outline. More effort shows as a drop of sweat and, at
 * the top, a flame around his bubble. Pure, so it is tested without a canvas.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The effort a session reports ("high"), or undefined when it says nothing known. */
export function effortLevel(effort: string | undefined): EffortLevel | undefined {
  const e = effort?.trim().toLowerCase();
  return EFFORTS.find((x) => x === e);
}

/** How many marks the effort earns: 0-1 none (high used to be a headband), 2 sweat, 3 + flame. */
export function effortMarks(effort: EffortLevel | undefined): 0 | 1 | 2 | 3 {
  if (effort === 'max') return 3;
  if (effort === 'xhigh') return 2;
  if (effort === 'high') return 1;
  return 0;
}

export type ModelFamily = 'haiku' | 'sonnet' | 'opus' | 'fable';

/** The family of a model id (claude-opus-5-5) or alias (opus[1m]). */
export function modelFamily(model: string | undefined): ModelFamily | undefined {
  const id = model?.toLowerCase() ?? '';
  return (['fable', 'opus', 'sonnet', 'haiku'] as const).find((f) => id.includes(f));
}

/** His body evolves with the model: a hatchling (shorter, big eyes, a
 *  sprout), the classic Clawd, crab claws, and the legend (golden claws,
 *  antennae and a cape). */
export type ClawdForm = 'hatchling' | 'classic' | 'claws' | 'legend';
/** What he is made of: folded paper, plush, polished metal, hologram. */
export type ClawdMaterial = 'paper' | 'plush' | 'metal' | 'holo';
/** The bubble's outline (its colour still tells the state): in segments,
 *  single, double, or a scalloped medal. */
export type BubbleRim = 'segments' | 'single' | 'double' | 'medal';

export interface ModelLook {
  /** Size of the Clawd and his bubble. */
  scale: number;
  form: ClawdForm;
  /** Absent when the model is unknown: the plain body. */
  material?: ClawdMaterial;
  rim: BubbleRim;
}

const LOOKS: Record<ModelFamily, ModelLook> = {
  haiku: { scale: 0.84, form: 'hatchling', material: 'paper', rim: 'segments' },
  sonnet: { scale: 1, form: 'classic', material: 'plush', rim: 'single' },
  opus: { scale: 1.14, form: 'claws', material: 'metal', rim: 'double' },
  fable: { scale: 1.28, form: 'legend', material: 'holo', rim: 'medal' },
};

/** Unknown model: the Clawd as he always was. */
const PLAIN: ModelLook = { scale: 1, form: 'classic', rim: 'single' };

export function modelLook(model: string | undefined): ModelLook {
  const family = modelFamily(model);
  return family ? LOOKS[family] : PLAIN;
}

/** Size of the Clawd and his bubble by model family (unknown: as is). */
export function modelScale(model: string | undefined): number {
  return modelLook(model).scale;
}

/** Rows a hatchling's head sits lower: he is three rows shorter. */
export function headDrop(form: ClawdForm | undefined): number {
  return form === 'hatchling' ? 3 : 0;
}
