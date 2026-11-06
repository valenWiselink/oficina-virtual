/**
 * The column at the office's left edge (pure rules, tested). What stays open
 * there — Pendientes, Historial or Artifacts, and the list of meetings —
 * takes room from the board instead of lying over it (asked 2026-11-06: a
 * panel you keep open must not cover the board or the tabs).
 */

/** The panels that share the column's main spot: one at a time. */
export type SidePanel = 'historial' | 'artifacts' | 'pendientes';

const SIDE_PANELS: readonly SidePanel[] = ['historial', 'artifacts', 'pendientes'];

/** A remembered panel, or null for anything else (nothing, or junk). */
export function readSidePanel(raw: string | null): SidePanel | null {
  return SIDE_PANELS.find((p) => p === raw) ?? null;
}

/** The next panel after a click on its button: the same one closes it. */
export function toggledPanel(open: SidePanel | null, clicked: SidePanel): SidePanel | null {
  return open === clicked ? null : clicked;
}

/**
 * What the column holds. `meetings` is the list open by choice (it still
 * hides in a narrow office unless `peek`, opened by hand there).
 */
export type DockShape = 'none' | 'meetings' | 'panel' | 'both';

export function dockShape(panel: boolean, meetings: boolean): DockShape {
  if (panel && meetings) return 'both';
  if (panel) return 'panel';
  return meetings ? 'meetings' : 'none';
}

/**
 * Classes for the column, per shape. The office region is the @container:
 * - meetings alone: 260px, and only from 760px of office (or peeked);
 * - a panel: about a third of the office, 260–380px;
 * - both: stacked (the list on top, as tall as it needs up to 40%) in a
 *   normal office, side by side from 1280px, where there is room for both.
 */
export function dockClasses(shape: DockShape, peek: boolean): string {
  const base = 'shrink-0 min-h-0 flex gap-8 ml-14 mt-10 mb-80';
  switch (shape) {
    case 'none':
      return 'hidden';
    case 'meetings':
      return `${base} w-[260px] flex-col ${peek ? '' : 'hidden @min-[760px]:flex'}`;
    case 'panel':
      return `${base} w-[clamp(260px,32%,380px)] flex-col`;
    case 'both':
      return `${base} w-[clamp(260px,32%,380px)] flex-col @min-[1280px]:w-auto @min-[1280px]:flex-row`;
  }
}
