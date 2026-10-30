import { describe, expect, it } from 'vitest';

import { heardNoteMs, heardNoteOf } from '../src/jarvis/heardNote.js';
import {
  fitPanel,
  PANEL_DEFAULT_PX,
  PANEL_MIN_PX,
  panelHeightCss,
  parsePanelSize,
  toggleMax,
} from '../src/jarvis/jarvisPanelSize.js';

describe('what Jarvis heard, beside its bubble', () => {
  const heard = { phase: 'idle' as const, heard: 'Vamos por ahora con eso', heardAt: 1 };

  it('says what you said beside the bubble, and nothing in the chat', () => {
    expect(heardNoteOf(heard, false)).toBe('Le dijiste: «Vamos por ahora con eso»');
    expect(heardNoteOf(heard, true)).toBeUndefined();
  });

  it('keeps the safety-net note in the chat', () => {
    expect(heardNoteOf({ ...heard, full: true }, true)).toMatch(
      /^Llegaste a los \d+:\d\d y se lo pasé\.$/,
    );
    expect(heardNoteOf({ ...heard, full: true }, false)).toMatch(/se lo pasé\. Le dijiste: «/);
  });

  it('says nothing while it listens or when it heard nothing', () => {
    expect(heardNoteOf({ ...heard, phase: 'listening' }, false)).toBeUndefined();
    expect(heardNoteOf({ phase: 'idle' }, false)).toBeUndefined();
  });

  it('stays a few seconds, a little more for a long text, never long', () => {
    expect(heardNoteMs('Sí')).toBeGreaterThanOrEqual(4000);
    expect(heardNoteMs('x'.repeat(60))).toBeGreaterThan(heardNoteMs('Sí'));
    expect(heardNoteMs('x'.repeat(5000))).toBe(8000);
  });
});

describe("the height of Jarvis's chat", () => {
  it('reads what it remembered, or the default for junk', () => {
    expect(parsePanelSize('{"height":500,"max":false}')).toEqual({ height: 500, max: false });
    expect(parsePanelSize('{"height":500,"max":true}')).toEqual({ height: 500, max: true });
    const fallback = { height: PANEL_DEFAULT_PX, max: false };
    expect(parsePanelSize(null)).toEqual(fallback);
    expect(parsePanelSize('nope')).toEqual(fallback);
    expect(parsePanelSize('{"height":10}')).toEqual(fallback);
    expect(parsePanelSize('{"height":"alto"}')).toEqual(fallback);
  });

  it('a drag stays between its minimum and the top of the office', () => {
    expect(fitPanel(100, 1000)).toEqual({ height: PANEL_MIN_PX, max: false });
    expect(fitPanel(500.4, 1000)).toEqual({ height: 500, max: false });
    expect(fitPanel(5000, 1000)).toEqual({ height: 900, max: true });
  });

  it('dragged near the top it is maximized, so it follows the window', () => {
    expect(fitPanel(895, 1000).max).toBe(true);
    expect(fitPanel(850, 1000).max).toBe(false);
  });

  it('in a small office it never asks for less than its minimum', () => {
    expect(fitPanel(600, 300)).toEqual({ height: PANEL_MIN_PX, max: true });
  });

  it('maximizes and restores the height it had', () => {
    const max = toggleMax({ height: 500, max: false }, 1000);
    expect(max).toEqual({ height: 500, max: true });
    expect(toggleMax(max, 1000)).toEqual({ height: 500, max: false });
  });

  it('restores to half the office when it had been dragged to the top', () => {
    expect(toggleMax({ height: 900, max: true }, 1000)).toEqual({ height: 500, max: false });
    expect(toggleMax({ height: 1900, max: true }, 2000)).toEqual({
      height: PANEL_DEFAULT_PX,
      max: false,
    });
  });

  it('its CSS never goes past the top of the office', () => {
    expect(panelHeightCss({ height: 500, max: false })).toBe('min(500px, calc(100% - 100px))');
    expect(panelHeightCss({ height: 500, max: true })).toBe('calc(100% - 100px)');
  });
});
