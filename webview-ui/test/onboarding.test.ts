import { describe, expect, it } from 'vitest';

import { samePath } from '../src/onboarding/samePath.js';
import { placeBubble } from '../src/onboarding/tourPlacement.js';

const VIEW = { w: 1200, h: 800 };
const BUBBLE = { w: 300, h: 160 };

describe('placeBubble', () => {
  it('goes below a target near the top, centred on it', () => {
    const p = placeBubble({ x: 500, y: 20, w: 200, h: 40 }, BUBBLE, VIEW);
    expect(p.side).toBe('bottom');
    expect(p.x).toBe(450);
    expect(p.y).toBe(74);
  });

  it('goes above a target at the bottom, kept inside the window', () => {
    const p = placeBubble({ x: 0, y: 740, w: 90, h: 40 }, BUBBLE, VIEW);
    expect(p.side).toBe('top');
    expect(p.x).toBe(12);
    expect(p.y).toBe(740 - 14 - 160);
  });

  it('goes beside a target as tall as the window', () => {
    const p = placeBubble({ x: 1000, y: 0, w: 60, h: 800 }, BUBBLE, VIEW);
    expect(p.side).toBe('left');
    expect(p.x).toBe(1000 - 14 - 300);
  });

  it('sits inside when there is room nowhere around it', () => {
    const p = placeBubble({ x: 0, y: 0, w: 1200, h: 800 }, BUBBLE, VIEW);
    expect(p.side).toBe('inside');
  });
});

describe('samePath', () => {
  it('ignores slashes, a trailing one and case', () => {
    expect(samePath('C:\\Proyectos\\api\\', 'c:/proyectos/api')).toBe(true);
    expect(samePath('C:\\proyectos\\api', 'C:\\proyectos\\web')).toBe(false);
  });
});
