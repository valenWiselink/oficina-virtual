import { describe, expect, it } from 'vitest';

import {
  approveStep,
  GRAPH_KEYS_HELP,
  graphKeyOf,
  type KeyLike,
  PAN_STEP_PX,
  ZOOM_STEP,
} from '../src/views/graphKeys.js';

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  code: '',
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe('graphKeyOf', () => {
  it('Shift+1 fits everyone and Shift+2 comes close, by key position', () => {
    expect(graphKeyOf(key('!', { code: 'Digit1', shiftKey: true }))).toEqual({ kind: 'fit' });
    // On a Spanish layout Shift+2 is '"': still the same key.
    expect(graphKeyOf(key('"', { code: 'Digit2', shiftKey: true }))).toEqual({
      kind: 'zoomSelected',
    });
    expect(graphKeyOf(key('1', { code: 'Digit1' }))).toBeNull();
  });

  it('+ and − zoom (also on the numpad)', () => {
    expect(graphKeyOf(key('+'))).toEqual({ kind: 'zoom', factor: ZOOM_STEP });
    expect(graphKeyOf(key('=', { code: 'Equal' }))).toEqual({ kind: 'zoom', factor: ZOOM_STEP });
    expect(graphKeyOf(key('-'))).toEqual({ kind: 'zoom', factor: 1 / ZOOM_STEP });
    expect(graphKeyOf(key('Subtract', { code: 'NumpadSubtract' }))).toEqual({
      kind: 'zoom',
      factor: 1 / ZOOM_STEP,
    });
  });

  it('arrows move the view toward them; with Shift, further', () => {
    expect(graphKeyOf(key('ArrowLeft'))).toEqual({ kind: 'pan', dx: PAN_STEP_PX, dy: 0 });
    expect(graphKeyOf(key('ArrowDown'))).toEqual({ kind: 'pan', dx: 0, dy: -PAN_STEP_PX });
    expect(graphKeyOf(key('ArrowRight', { shiftKey: true }))).toEqual({
      kind: 'pan',
      dx: -PAN_STEP_PX * 3,
      dy: 0,
    });
  });

  it('Tab, Enter, A, H, F, Esc and ?', () => {
    expect(graphKeyOf(key('Tab'))).toEqual({ kind: 'step', dir: 1 });
    expect(graphKeyOf(key('Tab', { shiftKey: true }))).toEqual({ kind: 'step', dir: -1 });
    expect(graphKeyOf(key('Enter'))).toEqual({ kind: 'open' });
    expect(graphKeyOf(key('a'))).toEqual({ kind: 'approve' });
    expect(graphKeyOf(key('A', { shiftKey: true }))).toEqual({ kind: 'approve' });
    expect(graphKeyOf(key('h'))).toEqual({ kind: 'done' });
    expect(graphKeyOf(key('f'))).toEqual({ kind: 'follow' });
    expect(graphKeyOf(key('Escape'))).toEqual({ kind: 'release' });
    expect(graphKeyOf(key('?', { shiftKey: true }))).toEqual({ kind: 'help' });
  });

  it('never takes a key with Ctrl, Alt or Meta (Claude Code and the office own those)', () => {
    expect(graphKeyOf(key('n', { altKey: true }))).toBeNull();
    expect(graphKeyOf(key('1', { altKey: true, code: 'Digit1' }))).toBeNull();
    expect(graphKeyOf(key('k', { ctrlKey: true }))).toBeNull();
    expect(graphKeyOf(key('a', { metaKey: true }))).toBeNull();
    expect(graphKeyOf(key('+', { ctrlKey: true }))).toBeNull();
  });

  it('lets every other key go', () => {
    expect(graphKeyOf(key('x'))).toBeNull();
    expect(graphKeyOf(key(' ', { code: 'Space' }))).toBeNull();
  });

  it('the "?" list names every key', () => {
    expect(GRAPH_KEYS_HELP.map(([k]) => k)).toEqual(
      expect.arrayContaining(['Tab / Shift+Tab', 'Enter', 'A', 'H', 'F', 'Esc', 'Shift+1', '?']),
    );
  });
});

describe('approveStep (A on a permission)', () => {
  it('a plain one is approved at once', () => {
    expect(approveStep(false, null, 'r1', 0, 4000)).toBe('allow');
  });

  it('a risky one needs A twice, for the same request, within the window', () => {
    expect(approveStep(true, null, 'r1', 0, 4000)).toBe('arm');
    expect(approveStep(true, { requestId: 'r1', at: 0 }, 'r1', 3000, 4000)).toBe('allow');
    expect(approveStep(true, { requestId: 'r1', at: 0 }, 'r1', 5000, 4000)).toBe('arm');
    expect(approveStep(true, { requestId: 'r0', at: 0 }, 'r1', 100, 4000)).toBe('arm');
  });
});
