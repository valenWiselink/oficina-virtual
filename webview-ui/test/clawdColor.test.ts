import { describe, expect, it } from 'vitest';

import { CLAWD_BODY_COLORS } from '../src/constants.js';
import { clawdColor, rotateHue } from '../src/views/clawdColor.js';

describe('clawdColor', () => {
  it('is the palette colour with no hue shift', () => {
    expect(clawdColor(4)).toBe(CLAWD_BODY_COLORS[4]);
    expect(clawdColor(4 + CLAWD_BODY_COLORS.length)).toBe(CLAWD_BODY_COLORS[4]);
  });

  it('tells two agents of the same palette apart by their hue shift', () => {
    expect(clawdColor(4, 90)).not.toBe(clawdColor(4, 0));
  });

  it('turns the hue and comes back after a full turn', () => {
    const red = 'ff' + '0000';
    const green = '00' + 'ff00';
    expect(rotateHue('#' + red, 120)).toBe('#' + green);
    expect(rotateHue(CLAWD_BODY_COLORS[2], 360)).toBe(CLAWD_BODY_COLORS[2].toLowerCase());
  });
});
