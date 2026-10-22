/** Pure rules shared by the agent card bars — highlight tier, the mobile
 *  bar's drag-to-reorder order and how the drawer's strip lies over the
 *  office (DOM-free, so they run on the Node runner). */

import { TERMINAL_SIDEBAR_WIDTH_PX, TERMINAL_STRIP_HEIGHT_PX } from '../constants.js';
import type { TerminalDock } from '../hooks/useTerminalDock.js';

/** Screen px at each side of a box. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * How far the drawer's strip of tabs lies over the office, per side. The
 * strip is see-through, so the office goes on under it instead of ending
 * where it starts (its own things stay clear of it). Docked at the bottom
 * nothing changes: Jarvis's bar already closes the office there.
 */
export function stripOverlap(dock: TerminalDock, shown: boolean): Insets {
  if (!shown) return NO_INSETS;
  if (dock === 'right') return { ...NO_INSETS, right: TERMINAL_SIDEBAR_WIDTH_PX };
  if (dock === 'left') return { ...NO_INSETS, left: TERMINAL_SIDEBAR_WIDTH_PX };
  if (dock === 'top') return { ...NO_INSETS, top: TERMINAL_STRIP_HEIGHT_PX };
  return NO_INSETS;
}

/** The office's padding: what it holds stays clear of the strip. */
export const officeRoom = (o: Insets) => ({
  paddingTop: o.top,
  paddingRight: o.right,
  paddingBottom: o.bottom,
  paddingLeft: o.left,
});

/** The drawer pulled over the office by that much, on the side facing it. */
export const drawerPull = (o: Insets) => ({
  marginTop: -o.bottom,
  marginRight: -o.left,
  marginBottom: -o.top,
  marginLeft: -o.right,
});

/** A band across the office (Jarvis's bar) that goes on under the strip at
 *  the sides, its content still clear of it. */
export const bandUnder = (o: Insets) => ({
  marginRight: -o.right,
  marginLeft: -o.left,
  paddingRight: o.right,
  paddingLeft: o.left,
});

/** Card highlight tiers: 'focused' = the agent's character is selected in the
 *  office (active background, no border); 'active' = its terminal pane is the
 *  one showing (background + accent border). */
export type CardVariant = 'default' | 'focused' | 'active';

/** One rule for both card bars: the showing terminal pane wins, then the
 *  character selected in the office. Pass activeId null where no pane shows
 *  (VS Code, or the mobile office page). */
export function cardVariant(
  agentId: number,
  { activeId, focusedId }: { activeId: number | null; focusedId: number | null },
): CardVariant {
  if (agentId === activeId) return 'active';
  if (agentId === focusedId) return 'focused';
  return 'default';
}

/** Saved order first (dropping closed agents), then any new agents appended
 *  in creation order — so a reorder survives launches and closes. */
export function mergeOrder(saved: readonly number[], live: readonly number[]): number[] {
  const liveSet = new Set(live);
  const ordered = saved.filter((id) => liveSet.has(id));
  const seen = new Set(ordered);
  for (const id of live) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * The order with `dragId` moved to where the finger is: before the first
 * other card whose horizontal midpoint lies right of `x`, else last.
 * `midpointOf` returns a card's midpoint in the same coordinate space as `x`
 * (null for a card that isn't laid out, which is skipped).
 */
export function reorderByPointer(
  ids: readonly number[],
  dragId: number,
  midpointOf: (id: number) => number | null,
  x: number,
): number[] {
  const others = ids.filter((id) => id !== dragId);
  let insertAt = others.length;
  for (let i = 0; i < others.length; i++) {
    const mid = midpointOf(others[i]);
    if (mid !== null && x < mid) {
      insertAt = i;
      break;
    }
  }
  return [...others.slice(0, insertAt), dragId, ...others.slice(insertAt)];
}
