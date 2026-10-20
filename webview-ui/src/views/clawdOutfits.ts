import { CLAWD_OUTFIT_COLORS } from '../constants.js';
import type { Outfit } from '../identity/clawdOutfit.js';
import type { ActivityProp } from './clawdTricks.js';

/** Paints one cell block of Clawd's 16×14 grid (graphDraw's drawClawd). */
export type Paint = (gx: number, gy: number, w: number, h: number, c: string) => void;

/**
 * Who wears what, by slot, so things never draw over each other:
 * - head: the outfit you chose, else the repo's (backend helmet, webapp pencil);
 * - face: the research glasses, alongside any hat;
 * - hands: the activity prop (wrench right, mug left), else flutter's phone in
 *   the left hand — the phone only gives way to the mug, which takes that hand.
 * So an activity never hides your outfit, and your outfit only hides the
 * repo's headwear.
 */
export function repoAccessoryShown(
  area: string | undefined,
  outfit: Outfit,
  prop: ActivityProp | undefined,
): boolean {
  if (area === 'backend' || area === 'webapp') return outfit === 'none';
  if (area === 'flutter') return prop !== 'coffee';
  return false;
}

/** The chosen outfit on Clawd's head (`by` is his head's top row). Colours
 *  are mid-tones with a darker edge so they read on light and dark paper. */
export function drawOutfit(R: Paint, outfit: Outfit, by: number): void {
  const c = CLAWD_OUTFIT_COLORS;
  if (outfit === 'cap') {
    // Side-facing baseball cap: rounded crown, brim out to the right.
    R(4, by - 3, 7, 1, c.cap);
    R(3, by - 2, 9, 2, c.cap);
    R(12, by - 1, 4, 1, c.capBrim);
    R(7, by - 4, 1, 1, c.capBrim);
  } else if (outfit === 'bow') {
    // A bow on the left of the head: two loops and the knot between.
    R(2, by - 2, 2, 2, c.bow);
    R(5, by - 2, 2, 2, c.bow);
    R(4, by - 2, 1, 2, c.bowKnot);
    R(2, by - 1, 1, 1, c.bowKnot);
    R(6, by - 1, 1, 1, c.bowKnot);
  } else if (outfit === 'crown') {
    // Gold band with three points and a red jewel.
    R(4, by - 3, 1, 1, c.crown);
    R(7, by - 4, 2, 2, c.crown);
    R(11, by - 3, 1, 1, c.crown);
    R(4, by - 2, 8, 2, c.crown);
    R(4, by - 1, 8, 1, c.crownShade);
    R(7, by - 2, 2, 1, c.crownJewel);
  } else if (outfit === 'headphones') {
    // Band over the head, cups on both sides above the arm nubs.
    R(2, by - 2, 12, 1, c.phonesBand);
    R(1, by - 1, 1, 2, c.phonesBand);
    R(14, by - 1, 1, 2, c.phonesBand);
    R(0, by + 1, 2, 3, c.phonesCup);
    R(14, by + 1, 2, 3, c.phonesCup);
    R(0, by + 1, 1, 1, c.phonesShine);
    R(15, by + 1, 1, 1, c.phonesShine);
  }
}

/** The watch on his raised left arm while he checks the time (impatient). */
export function drawWatch(R: Paint, armY: number): void {
  R(-1, armY + 1, 1, 1, CLAWD_OUTFIT_COLORS.watch);
}
