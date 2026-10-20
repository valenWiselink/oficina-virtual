import { describe, expect, it } from 'vitest';

import { wantsIntroPreview } from '../src/intro/introStore.js';
import {
  beatAt,
  BOARD_BEATS,
  boardLayout,
  nextScene,
  prevScene,
  SCENES,
  SPACES_AGENTS,
  SPACES_BEATS,
  spacesView,
  streamedWords,
  typedText,
} from '../src/intro/introTimeline.js';

describe('presentation timeline', () => {
  it('lasts about forty seconds and ends waiting for "Empezar"', () => {
    const timed = SCENES.reduce((n, s) => n + (s.ms ?? 0), 0);
    expect(timed).toBeGreaterThanOrEqual(35_000);
    expect(timed).toBeLessThanOrEqual(45_000);
    expect(SCENES[SCENES.length - 1].ms).toBeNull();
  });

  it('steps between scenes without leaving the range', () => {
    expect(prevScene(0)).toBe(0);
    expect(nextScene(SCENES.length - 1)).toBe(SCENES.length - 1);
    expect(nextScene(2)).toBe(3);
  });

  it('knows which beat is due', () => {
    expect(beatAt(0, BOARD_BEATS)).toBe(0);
    expect(beatAt(2400, BOARD_BEATS)).toBe(2);
    expect(beatAt(99_999, BOARD_BEATS)).toBe(BOARD_BEATS.length - 1);
  });
});

describe('board scene', () => {
  it('hides the cards until they pop in', () => {
    expect(Object.values(boardLayout(0)).every((s) => !s.shown)).toBe(true);
    expect(Object.values(boardLayout(1)).every((s) => s.shown)).toBe(true);
  });

  it('sends "Pagos" to "Te necesita" and, once done, to "Terminó"', () => {
    expect(boardLayout(1).pagos.col).toBe(1);
    expect(boardLayout(2).pagos.col).toBe(0);
    expect(boardLayout(4).pagos.col).toBe(0);
    expect(boardLayout(5).pagos.col).toBe(2);
  });

  it('never puts two cards in the same place', () => {
    for (let beat = 0; beat < BOARD_BEATS.length; beat++) {
      const places = Object.values(boardLayout(beat)).map((s) => `${s.col}:${s.row}`);
      expect(new Set(places).size).toBe(places.length);
    }
  });
});

describe('typing', () => {
  it('types a character at a time and streams a word at a time', () => {
    expect(typedText('hola', 100, 50, 50)).toBe('');
    expect(typedText('hola', 100, 50, 160)).toBe('ho');
    expect(typedText('hola', 100, 50, 10_000)).toBe('hola');
    expect(streamedWords('uno dos tres', 0, 100, 150)).toBe('uno dos');
  });
});

describe('preview switch', () => {
  it('turns on with ?intro=1 only', () => {
    expect(wantsIntroPreview('?intro=1')).toBe(true);
    expect(wantsIntroPreview('?token=x&intro=1')).toBe(true);
    expect(wantsIntroPreview('?intro=0')).toBe(false);
    expect(wantsIntroPreview('')).toBe(false);
  });
});

describe('workspaces scene', () => {
  it('starts on "Todos" with every agent, each in its own place', () => {
    const view = spacesView(0);
    expect(view.tab).toBe('todos');
    expect(Object.values(view.cards).every((c) => c.shown)).toBe(true);
    expect(new Set(Object.values(view.cards).map((c) => c.slot)).size).toBe(SPACES_AGENTS.length);
  });

  it('keeps only the open space agents, packed from the first place', () => {
    for (const [beat, tab] of [
      [2, 'wiselink'],
      [5, 'personal'],
    ] as const) {
      const view = spacesView(beat);
      expect(view.tab).toBe(tab);
      const shown = SPACES_AGENTS.filter((a) => view.cards[a.id].shown);
      expect(shown.every((a) => a.space === tab)).toBe(true);
      expect(shown.map((a) => view.cards[a.id].slot).sort()).toEqual(shown.map((_, i) => i));
    }
  });

  it('shows the needs-you count on "Personal" only while another space is open', () => {
    const badges = SPACES_BEATS.map((_, beat) => spacesView(beat).badge);
    expect(badges).toEqual([false, false, false, true, true, false]);
  });
});
