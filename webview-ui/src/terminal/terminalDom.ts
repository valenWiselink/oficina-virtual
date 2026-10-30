import type { Terminal } from '@xterm/xterm';

import { XTERM_HELPER_TEXTAREA_CLASS, XTERM_SCREEN_SELECTOR } from '../constants.js';
import type { CellGrid, CellPos } from './selectionMath.js';
import { cellFromPoint, cellGrid } from './selectionMath.js';

/**
 * The ONE geometry source for touch input on a terminal pane: the rect of
 * xterm's cell grid (.xterm-screen), falling back to the host before the
 * terminal has opened. Hit-testing, the scroll row height and the selection
 * chrome all read it, so a drag of one row-height is exactly one row of
 * cells. The host is not used for any of it: after fit() it keeps up to a
 * row of slack below the grid, so host height / rows overstates a row.
 */
export function terminalScreen(term: Terminal, host: HTMLElement): Element {
  return term.element?.querySelector(XTERM_SCREEN_SELECTOR) ?? host;
}

export function terminalScreenRect(term: Terminal, host: HTMLElement): DOMRect {
  return terminalScreen(term, host).getBoundingClientRect();
}

/** The absolute buffer cell under client point (x, y). */
export function terminalCellAt(term: Terminal, host: HTMLElement, x: number, y: number): CellPos {
  return cellFromPoint(
    terminalScreenRect(term, host),
    term.cols,
    term.rows,
    term.buffer.active.viewportY,
    x,
    y,
  );
}

/** Pixel height of one terminal row (`fallbackPx` until there is a grid). */
export function terminalRowHeightPx(term: Terminal, host: HTMLElement, fallbackPx: number): number {
  const { height } = terminalScreenRect(term, host);
  return height > 0 && term.rows > 0 ? height / term.rows : fallbackPx;
}

/** The cell grid's pixel geometry relative to the host. */
export function terminalCellGrid(term: Terminal, host: HTMLElement): CellGrid {
  return cellGrid(
    terminalScreenRect(term, host),
    host.getBoundingClientRect(),
    term.cols,
    term.rows,
    term.buffer.active.viewportY,
  );
}

/** True when `el` is a terminal's input — the user is typing into a pane. */
export function isTypingInTerminal(el: Element | null): boolean {
  return el instanceof HTMLElement && el.classList.contains(XTERM_HELPER_TEXTAREA_CLASS);
}

/**
 * True when `el` is a box you write in that is not a terminal (a chat's,
 * a dialog's): a pane that shows up must not take the focus from it, or
 * the rest of what you type lands in that terminal and the office's next
 * Enter sends it (Jarvis's chat, 2026-10-30).
 */
export function isTypingInField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || isTypingInTerminal(el)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !NOT_TYPED.has(el.type);
}

const NOT_TYPED = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'file',
  'color',
]);
