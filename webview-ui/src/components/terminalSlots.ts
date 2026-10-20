import type { CSSProperties } from 'react';

/** Gap between a pane and its slot's edges, in px. */
const PANE_INSET_PX = 4;

export interface TerminalSlot {
  header: CSSProperties;
  pane: CSSProperties;
}

/**
 * Where each visible terminal goes inside the panel: one slot fills it; two
 * split it in halves, stacked when the panel is a tall column (docked at a
 * side) and side by side when it is a wide strip (docked top or bottom).
 * Each slot is its header on top and the terminal under it.
 */
export function terminalSlots(
  count: 1 | 2,
  split: 'rows' | 'cols',
  headerPx: number,
): TerminalSlot[] {
  const slots: TerminalSlot[] = [];
  for (let i = 0; i < count; i++) {
    const from = count === 1 ? '0%' : `${i * 50}%`;
    const to = count === 1 ? '0%' : `${(1 - i) * 50}%`;
    // Always with a unit: calc() rejects a bare 0 next to px.
    const box =
      split === 'rows' || count === 1
        ? { left: '0%', right: '0%', top: from, bottom: to }
        : { top: '0%', bottom: '0%', left: from, right: to };
    slots.push({
      header: { position: 'absolute', ...box, bottom: undefined, height: headerPx },
      pane: {
        position: 'absolute',
        top: `calc(${box.top} + ${headerPx + PANE_INSET_PX}px)`,
        bottom: `calc(${box.bottom} + ${PANE_INSET_PX}px)`,
        left: `calc(${box.left} + ${PANE_INSET_PX}px)`,
        right: `calc(${box.right} + ${PANE_INSET_PX}px)`,
      },
    });
  }
  return slots;
}
