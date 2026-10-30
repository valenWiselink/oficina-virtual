import { useState } from 'react';

/**
 * How tall Jarvis's chat panel is (asked 2026-10-30: it can grow up to the
 * top of the office). You drag its top edge or maximize it from its header;
 * this browser remembers it. The CSS keeps it inside the office however
 * small the window gets, so a remembered height never pushes it off-screen.
 */

const KEY = 'oficina.jarvisAlto';
export const PANEL_MIN_PX = 280;
export const PANEL_DEFAULT_PX = 640;
/** What the office keeps free around it: the bubble below (84) and a margin above (16). */
export const PANEL_FREE_PX = 100;
/** One ↑/↓ on its edge. */
export const PANEL_STEP_PX = 40;
/** Dragged this close to the top, it is maximized (and follows the window). */
const SNAP_PX = 12;

export interface PanelSize {
  /** Its height in px when not maximized. */
  height: number;
  /** Up to the top of the office, whatever the window's size. */
  max: boolean;
}

const DEFAULT_SIZE: PanelSize = { height: PANEL_DEFAULT_PX, max: false };

/** The tallest it can be in an office `room` px tall. */
function tallest(room: number): number {
  return Math.max(PANEL_MIN_PX, room - PANEL_FREE_PX);
}

/** A remembered size, or the default for anything else. */
export function parsePanelSize(raw: string | null): PanelSize {
  try {
    const v = JSON.parse(raw ?? '') as Partial<PanelSize>;
    const height = Number(v.height);
    if (!Number.isFinite(height) || height < PANEL_MIN_PX) return DEFAULT_SIZE;
    return { height: Math.round(height), max: v.max === true };
  } catch {
    return DEFAULT_SIZE;
  }
}

/** A height asked by a drag or a key, inside an office `room` px tall. */
export function fitPanel(height: number, room: number): PanelSize {
  const top = tallest(room);
  const fitted = Math.round(Math.min(Math.max(height, PANEL_MIN_PX), top));
  return { height: fitted, max: fitted >= top - SNAP_PX };
}

/** The header's button: maximize, or back to the height it had (half the
 *  office when it had been dragged to the top). */
export function toggleMax(size: PanelSize, room: number): PanelSize {
  if (!size.max) return { ...size, max: true };
  const top = tallest(room);
  const height =
    size.height >= top - SNAP_PX
      ? Math.max(PANEL_MIN_PX, Math.min(PANEL_DEFAULT_PX, Math.round(room / 2)))
      : size.height;
  return { height, max: false };
}

/** Its CSS height, never beyond the top of the office. */
export function panelHeightCss(size: PanelSize): string {
  const room = `calc(100% - ${PANEL_FREE_PX}px)`;
  return size.max ? room : `min(${size.height}px, ${room})`;
}

/** Its CSS min-height: what it needs, unless the office is smaller still. */
export const PANEL_MIN_CSS = `min(${PANEL_MIN_PX}px, calc(100% - ${PANEL_FREE_PX}px))`;

function recall(): PanelSize {
  try {
    return parsePanelSize(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SIZE;
  }
}

/** Its size, and a setter: `keep` saves it (at the end of a drag, not on every move). */
export function useJarvisPanelSize(): [PanelSize, (next: PanelSize, keep?: boolean) => void] {
  const [size, setSize] = useState(recall);
  const update = (next: PanelSize, keep = true) => {
    setSize(next);
    if (!keep) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* blocked storage: it lasts this tab */
    }
  };
  return [size, update];
}
