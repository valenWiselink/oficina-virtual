import { afterEach, describe, expect, it } from 'vitest';

import {
  DRAFT_HOLD_MS,
  forgetWindowInput,
  isDrafting,
  noteWindowInput,
} from '../src/terminal/windowInput.js';

describe('what you are writing in a terminal', () => {
  afterEach(() => forgetWindowInput());

  it('is open from the first key until Enter', () => {
    noteWindowInput(1, 'n', 1000);
    noteWindowInput(1, 'o hace falt', 2000);
    expect(isDrafting(1, 3000)).toBe(true);
    expect(isDrafting(2, 3000)).toBe(false);
    noteWindowInput(1, '\r', 4000);
    expect(isDrafting(1, 4001)).toBe(false);
  });

  it('opens with a paste and closes with Ctrl+C', () => {
    noteWindowInput(1, '\x1b[200~hola\rqué tal\x1b[201~', 1000);
    expect(isDrafting(1, 1100)).toBe(true);
    noteWindowInput(1, '\x03', 1200);
    expect(isDrafting(1, 1300)).toBe(false);
  });

  it('a message sent from the chat (paste, then Enter) leaves nothing open', () => {
    noteWindowInput(1, '\x1b[200~hola\x1b[201~', 1000);
    noteWindowInput(1, '\r', 1080);
    expect(isDrafting(1, 1100)).toBe(false);
  });

  it('keys that only move or report focus do not open it', () => {
    for (const key of ['\x1b[A', '\x1b[D', '\x1b[I', '\x1b[O', '\x1b'])
      noteWindowInput(1, key, 1000);
    expect(isDrafting(1, 1100)).toBe(false);
  });

  it('a Backspace counts as writing, and it stops holding a while after the last key', () => {
    noteWindowInput(1, '\x7f', 1000);
    expect(isDrafting(1, 1000 + DRAFT_HOLD_MS - 1)).toBe(true);
    expect(isDrafting(1, 1000 + DRAFT_HOLD_MS)).toBe(false);
  });
});
