import { describe, expect, it } from 'vitest';

import { CLAWD_BODY_COLORS, CLAWD_MODEL_COLORS } from '../src/constants.js';
import type { BubbleRim, ClawdMaterial } from '../src/views/clawdLook.js';
import {
  drawArms,
  drawBody,
  drawCape,
  drawCrest,
  drawEyes,
  strokeBubble,
  traceBubble,
} from '../src/views/clawdModelArt.js';
import type { Paint } from '../src/views/clawdOutfits.js';

/** Paints into a map of grid cells ("x,y" → colour), the last colour winning. */
function grid(): { R: Paint; cells: Map<string, string> } {
  const cells = new Map<string, string>();
  const R: Paint = (gx, gy, w, h, c) => {
    for (let x = gx; x < gx + w; x++) for (let y = gy; y < gy + h; y++) cells.set(`${x},${y}`, c);
  };
  return { R, cells };
}

const xs = (cells: Map<string, string>) => [...cells.keys()].map((k) => Number(k.split(',')[0]));
const BODY = CLAWD_BODY_COLORS[0];
// Any colour other than the body's, to tell the base row apart.
const DARK = CLAWD_MODEL_COLORS.capeDark;

describe('drawBody', () => {
  it('makes a hatchling three rows shorter, with rounded shoulders', () => {
    const classic = grid();
    drawBody(classic.R, BODY, DARK, 0, { form: 'classic' });
    expect(classic.cells.has('1,0')).toBe(true);
    const hatchling = grid();
    drawBody(hatchling.R, BODY, DARK, 0, { form: 'hatchling' });
    expect(hatchling.cells.has('2,2')).toBe(false);
    expect(hatchling.cells.has('1,3')).toBe(false);
    expect(hatchling.cells.get('2,3')).toBe(BODY);
    expect(hatchling.cells.get('1,10')).toBe(DARK);
  });

  it('paints each material inside the body and leaves the plain one alone', () => {
    const plain = grid();
    drawBody(plain.R, BODY, DARK, 0, {});
    for (const material of ['paper', 'plush', 'metal', 'holo'] as ClawdMaterial[]) {
      const g = grid();
      drawBody(g.R, BODY, DARK, 0, { material, anim: 1.7 });
      expect([...g.cells.keys()].sort()).toEqual([...plain.cells.keys()].sort());
      const changed = [...g.cells].filter(([k, c]) => plain.cells.get(k) !== c);
      expect(changed.length, material).toBeGreaterThan(3);
    }
  });

  it('moves the metal shine and the hologram only while animated', () => {
    for (const material of ['metal', 'holo'] as ClawdMaterial[]) {
      const at = (anim: number | undefined) => {
        const g = grid();
        drawBody(g.R, BODY, DARK, 0, { material, anim });
        return [...g.cells];
      };
      expect(at(0.4)).not.toEqual(at(1.9));
      expect(at(undefined)).toEqual(at(undefined));
    }
  });
});

describe('drawArms', () => {
  it('grows claws past the body when the hands are free', () => {
    const g = grid();
    drawArms(g.R, BODY, 0, 'claws', { leftHeld: false, rightHeld: false }, 0);
    expect(Math.min(...xs(g.cells))).toBe(-3);
    expect(Math.max(...xs(g.cells))).toBe(18);
  });

  it('gives the legend golden claw tips', () => {
    const g = grid();
    drawArms(g.R, BODY, 0, 'legend', { leftHeld: false, rightHeld: false }, 0);
    expect([...g.cells.values()]).toContain(CLAWD_MODEL_COLORS.gold);
  });

  it('keeps a plain arm in a hand that holds something', () => {
    const g = grid();
    const { la } = drawArms(g.R, BODY, 0, 'claws', { leftHeld: true, rightHeld: true }, 0);
    expect(Math.min(...xs(g.cells))).toBe(0);
    expect(Math.max(...xs(g.cells))).toBe(15);
    expect(la).toBe(4);
  });

  it('hangs a hatchling arms two rows lower and still waves', () => {
    const g = grid();
    const { la, ra } = drawArms(
      g.R,
      BODY,
      0,
      'hatchling',
      { leftHeld: false, rightHeld: false },
      0,
    );
    expect([la, ra]).toEqual([6, 6]);
    const waving = grid();
    drawArms(waving.R, BODY, 0, 'hatchling', { wave: 1, leftHeld: false, rightHeld: false }, 0);
    expect(waving.cells.has('16,1')).toBe(true);
  });

  it('raises a waving claw', () => {
    const g = grid();
    drawArms(g.R, BODY, 0, 'claws', { wave: 1, leftHeld: false, rightHeld: false }, 0);
    expect(
      [...g.cells.keys()].some((k) => k.startsWith('18,') && Number(k.split(',')[1]) < 0),
    ).toBe(true);
  });
});

describe('drawEyes', () => {
  it('gives a hatchling big eyes with a shine', () => {
    const g = grid();
    drawEyes(g.R, {}, 0, 5, true);
    expect(g.cells.get('3,5')).toBe(CLAWD_MODEL_COLORS.shine);
    expect(g.cells.has('4,6')).toBe(true);
    expect(g.cells.has('12,6')).toBe(true);
  });

  it('half-closes them on low effort and keeps the classic eyes in place', () => {
    const lidded = grid();
    drawEyes(lidded.R, { effort: 'low' }, 0, 2, false);
    expect([...lidded.cells.keys()].sort()).toEqual(['11,3', '4,3']);
    const happy = grid();
    drawEyes(happy.R, { happy: true }, 0, 2, true);
    expect(happy.cells.size).toBe(6);
  });
});

describe('drawCrest', () => {
  it('sprouts a leaf on a hatchling and antennae on the legend, nothing on others', () => {
    for (const form of ['hatchling', 'legend'] as const) {
      const g = grid();
      drawCrest(g.R, form, 3, 1);
      expect([...g.cells.keys()].every((k) => Number(k.split(',')[1]) < 3)).toBe(true);
      expect(g.cells.size).toBeGreaterThan(3);
    }
    const none = grid();
    drawCrest(none.R, 'classic', 0, 1);
    expect(none.cells.size).toBe(0);
  });
});

describe('drawCape', () => {
  it('shows only beside him, wider toward his feet, and still in calm mode', () => {
    const g = grid();
    drawCape(g.R, 0, 0, undefined);
    expect(xs(g.cells).every((x) => x <= 0 || x === 15)).toBe(true);
    const width = (y: number) =>
      xs(new Map([...g.cells].filter(([k]) => k.endsWith(`,${y}`) && !k.startsWith('15,')))).length;
    expect(width(10)).toBeGreaterThan(width(1));
    const again = grid();
    drawCape(again.R, 0, 0, undefined);
    expect([...again.cells]).toEqual([...g.cells]);
  });
});

describe('bubble outline', () => {
  function fakeCtx() {
    const calls = { arc: 0, lineTo: 0, stroke: 0 };
    const ctx = {
      lineWidth: 1,
      globalAlpha: 1,
      beginPath() {},
      closePath() {},
      moveTo() {},
      save() {},
      restore() {},
      arc() {
        calls.arc++;
      },
      lineTo() {
        calls.lineTo++;
      },
      stroke() {
        calls.stroke++;
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it('strokes each model its way', () => {
    const strokes = (['segments', 'single', 'double', 'medal'] as BubbleRim[]).map((rim) => {
      const { ctx, calls } = fakeCtx();
      traceBubble(ctx, 0, 0, 40, rim, 0);
      strokeBubble(ctx, 0, 0, 40, rim, 0);
      return calls.stroke;
    });
    expect(strokes).toEqual([7, 1, 2, 2]);
  });

  it('scallops only the medal', () => {
    const medal = fakeCtx();
    traceBubble(medal.ctx, 0, 0, 40, 'medal', 3);
    expect(medal.calls.lineTo).toBeGreaterThan(100);
    const single = fakeCtx();
    traceBubble(single.ctx, 0, 0, 40, 'single', 3);
    expect([single.calls.arc, single.calls.lineTo]).toEqual([1, 0]);
  });
});
