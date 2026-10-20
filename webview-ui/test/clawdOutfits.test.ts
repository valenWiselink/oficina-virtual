import { describe, expect, it } from 'vitest';

import { impatience, IMPATIENT_AFTER_MS } from '../src/views/clawdImpatience.js';
import { drawOutfit, repoAccessoryShown } from '../src/views/clawdOutfits.js';

describe('repoAccessoryShown', () => {
  it('lets your outfit take the head from the repo headwear', () => {
    expect(repoAccessoryShown('backend', 'none', undefined)).toBe(true);
    expect(repoAccessoryShown('backend', 'crown', undefined)).toBe(false);
    expect(repoAccessoryShown('webapp', 'cap', undefined)).toBe(false);
  });

  it('keeps the phone unless the mug takes that hand', () => {
    expect(repoAccessoryShown('flutter', 'cap', 'wrench')).toBe(true);
    expect(repoAccessoryShown('flutter', 'none', 'coffee')).toBe(false);
  });

  it('has nothing to show for other repos', () => {
    expect(repoAccessoryShown(undefined, 'none', undefined)).toBe(false);
  });
});

describe('drawOutfit', () => {
  it('paints each outfit and nothing for none', () => {
    for (const outfit of ['cap', 'bow', 'crown', 'headphones'] as const) {
      let cells = 0;
      drawOutfit(() => cells++, outfit, 0);
      expect(cells).toBeGreaterThan(3);
    }
    let none = 0;
    drawOutfit(() => none++, 'none', 0);
    expect(none).toBe(0);
  });
});

describe('impatience', () => {
  it('starts only after 10 minutes of waiting', () => {
    expect(impatience(IMPATIENT_AFTER_MS - 1, 3, 1)).toBeNull();
    expect(impatience(IMPATIENT_AFTER_MS, 3, 1)).not.toBeNull();
  });

  it('taps the foot and checks the watch, never both at once', () => {
    const frames = Array.from({ length: 120 }, (_, i) =>
      impatience(IMPATIENT_AFTER_MS, i * 0.05, 0),
    );
    expect(frames.some((f) => f?.footUp)).toBe(true);
    expect(frames.some((f) => f?.watch)).toBe(true);
    expect(frames.some((f) => f?.watch && f.footUp)).toBe(false);
  });

  it('gives each agent its own beat', () => {
    const beat = (seed: number) =>
      Array.from({ length: 40 }, (_, i) => impatience(IMPATIENT_AFTER_MS, i * 0.05, seed));
    expect(beat(1)).not.toEqual(beat(2));
  });
});
