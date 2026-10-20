import { CLAWD_ACCESSORY_COLORS, CLAWD_OUTFIT_COLORS, CLAWD_PROP_COLORS } from '../constants.js';
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

/** The repo accessory, on the same pixel grid as Clawd. */
export function drawAccessory(R: Paint, area: string | undefined, by: number, leftArm: number) {
  const c = CLAWD_ACCESSORY_COLORS;
  if (area === 'backend') {
    R(3, by - 2, 10, 1, c.helmet);
    R(2, by - 1, 12, 1, c.helmet);
    R(1, by - 1, 1, 1, c.helmetEdge);
    R(14, by - 1, 1, 1, c.helmetEdge);
  } else if (area === 'webapp') {
    R(13, by - 1, 1, 1, c.pencilWood);
    R(14, by - 2, 1, 1, c.pencilWood);
    R(15, by - 3, 1, 1, c.pencilTip);
  } else if (area === 'flutter') {
    R(-2, leftArm - 1, 2, 3, c.phone);
    R(-2, leftArm, 1, 1, c.phoneScreen);
  }
}

/** What he holds for what he is doing, on his pixel grid. */
export function drawProp(
  R: Paint,
  prop: ActivityProp,
  leftArm: number,
  rightArm: number,
  eyeY: number,
  bigEyes: boolean,
) {
  const c = CLAWD_PROP_COLORS;
  if (prop === 'glasses') {
    // A frame around each eye (x 4 and 11, a hatchling's are two wide) and a
    // bridge between them.
    const w = bigEyes ? 4 : 3;
    for (const fx of bigEyes ? [2, 10] : [3, 10]) {
      R(fx, eyeY - 1, w, 1, c.glasses);
      R(fx, eyeY + 2, w, 1, c.glasses);
      R(fx, eyeY, 1, 2, c.glasses);
      R(fx + w - 1, eyeY, 1, 2, c.glasses);
    }
    R(6, eyeY, 4, 1, c.glasses);
  } else if (prop === 'wrench') {
    // Held up in the right hand: handle, then the open jaw on top.
    R(16, rightArm - 3, 1, 4, c.wrench);
    R(15, rightArm - 5, 3, 2, c.wrenchDark);
    R(16, rightArm - 5, 1, 1, c.wrench);
  } else {
    // A mug in the left hand, coffee showing at the rim.
    R(-3, leftArm - 1, 3, 3, c.mug);
    R(-3, leftArm - 1, 3, 1, c.coffee);
    R(-4, leftArm, 1, 1, c.mugEdge);
    R(-2, leftArm - 3, 1, 1, c.mugEdge); // a wisp of steam
  }
}
