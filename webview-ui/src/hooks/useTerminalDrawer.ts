import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentAppearance, TabStatus } from '../components/AgentCard.js';
import {
  TERMINAL_DRAWER_DEFAULT_HEIGHT_PX,
  TERMINAL_DRAWER_DEFAULT_WIDTH_PX,
  TERMINAL_DRAWER_MAX_HEIGHT_RATIO,
  TERMINAL_DRAWER_MAX_WIDTH_RATIO,
  TERMINAL_DRAWER_MIN_HEIGHT_PX,
  TERMINAL_DRAWER_MIN_WIDTH_PX,
  TERMINAL_SIDEBAR_WIDTH_PX,
  TERMINAL_STRIP_HEIGHT_PX,
} from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import type { AgentKind } from '../views/agentViews.js';
import { isVerticalDock, type TerminalDock } from './useTerminalDock.js';

/** A character not (yet) in the office — the mug shot falls back to palette 0. */
const DEFAULT_APPEARANCE: AgentAppearance = { palette: 0, hueShift: 0 };

interface TerminalDrawerInputs {
  /** Agent ids with a live server-side PTY, in open order (control plane). */
  terminalAgentIds: number[];
  getOfficeState: () => OfficeState;
  /** The agent's state as the board shows it (one source for the tab dot). */
  kindOf: (agentId: number) => AgentKind | undefined;
  /** The edge the panel docks to; it decides which way it sizes and drags. */
  dock: TerminalDock;
}

export interface TerminalDrawerController {
  activeAgentId: number | null;
  /** The pane actually showing: the active agent's, or the first terminal
   *  when the active agent has no PTY (an external session's character was
   *  clicked). null only when there are no terminals. Both shells and the
   *  mobile key bar read this one resolution. */
  shownAgentId: number | null;
  isOpen: boolean;
  /** Open size along the dock's axis: width at the sides, height top/bottom. */
  sizePx: number;
  /** The newest terminal the drawer saw appear (launch answered, or a reload
   *  re-announcing live sessions) — it became the active tab. `seq` makes
   *  every appearance a distinct value for effects to key on. */
  lastOpened: { agentId: number; seq: number } | null;
  /** Show an agent's terminal if it has one; no-op otherwise. The office's
   *  character click routes here: standalone has no editor panel to raise, so
   *  "focus the agent" means "open its tab", mirroring VS Code's terminalRef.show(). */
  reveal: (agentId: number) => void;
  /** Make this the active tab without opening a closed panel (a workspace
   *  switch keeps the panel as it was, showing one of its own agents). */
  showTab: (agentId: number) => void;
  /** Card click: open the tab AND select + follow the character, so the card
   *  and the office stay in sync. */
  select: (agentId: number) => void;
  close: () => void;
  /** The terminal kept on screen beside the active one (split view), if any. */
  pinnedId: number | null;
  togglePin: (agentId: number) => void;
  onResizeStart: (e: ReactMouseEvent) => void;
  getAppearance: (agentId: number) => AgentAppearance;
  /** Card status dot: 'disconnected' (red) for a terminal whose socket
   *  dropped, otherwise the agent's activity; null before its first activity. */
  statusFor: (agentId: number) => TabStatus | null;
  /** Each TerminalPane reports its socket state here. */
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
}

/**
 * The drawer width that fits a viewport: the office keeps at least the card
 * bar's width (the cards overlay its right edge, and they are the only way to
 * switch agents), so on a narrow screen the minimum gives way to that.
 */
export function clampDrawerWidth(preferredPx: number, viewportPx: number): number {
  const maxPx = Math.min(
    viewportPx * TERMINAL_DRAWER_MAX_WIDTH_RATIO,
    viewportPx - TERMINAL_SIDEBAR_WIDTH_PX,
  );
  return Math.max(0, Math.min(maxPx, Math.max(TERMINAL_DRAWER_MIN_WIDTH_PX, preferredPx)));
}

/** The same for a panel above or below the office (the card row stays visible). */
export function clampDrawerHeight(preferredPx: number, viewportPx: number): number {
  const maxPx = Math.min(
    viewportPx * TERMINAL_DRAWER_MAX_HEIGHT_RATIO,
    viewportPx - TERMINAL_STRIP_HEIGHT_PX,
  );
  return Math.max(0, Math.min(maxPx, Math.max(TERMINAL_DRAWER_MIN_HEIGHT_PX, preferredPx)));
}

/**
 * All state and derivations behind the standalone terminal panes, on both
 * shells: which tab is active (and which pane that resolves to), whether the
 * desktop panel is open, its width and drag-resize gesture, each pane's socket
 * state, and the per-agent lookups the cards render from. App only composes it.
 */
export function useTerminalDrawer({
  terminalAgentIds,
  getOfficeState,
  kindOf,
  dock,
}: TerminalDrawerInputs): TerminalDrawerController {
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [lastOpened, setLastOpened] = useState<{ agentId: number; seq: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // The width the user asked for; what renders is that clamped to the
  // viewport, re-derived on every window resize so a window that narrows
  // while the drawer is open never pushes the office (and its cards) out.
  const [preferredWidthPx, setPreferredWidthPx] = useState(TERMINAL_DRAWER_DEFAULT_WIDTH_PX);
  const [preferredHeightPx, setPreferredHeightPx] = useState(TERMINAL_DRAWER_DEFAULT_HEIGHT_PX);
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const vertical = isVerticalDock(dock);
  const sizePx = vertical
    ? clampDrawerHeight(preferredHeightPx, viewport.h)
    : clampDrawerWidth(preferredWidthPx, viewport.w);
  const [connStatuses, setConnStatuses] = useState<Record<number, TerminalConnectionStatus>>({});

  const shownAgentId =
    activeAgentId !== null && terminalAgentIds.includes(activeAgentId)
      ? activeAgentId
      : (terminalAgentIds[0] ?? null);

  // Reveal a newly-opened terminal. Launching is async — the toolbar sends
  // launchAgent and the server answers with terminalSessionOpened once the PTY
  // is up — so "open the drawer on launch" is expressed as "open it when a
  // terminal we hadn't seen appears". This also restores the drawer after a
  // reload, when webviewReady re-announces the live sessions.
  const knownIdsRef = useRef<number[]>([]);
  useEffect(() => {
    const added = terminalAgentIds.filter((id) => !knownIdsRef.current.includes(id));
    knownIdsRef.current = terminalAgentIds;
    if (added.length === 0) return;
    const newest = added[added.length - 1];
    setActiveAgentId(newest);
    setIsOpen(true);
    setLastOpened((prev) => ({ agentId: newest, seq: (prev?.seq ?? 0) + 1 }));
  }, [terminalAgentIds]);

  const reveal = useCallback(
    (agentId: number) => {
      if (!terminalAgentIds.includes(agentId)) return;
      setActiveAgentId(agentId);
      setIsOpen(true);
    },
    [terminalAgentIds],
  );

  const select = useCallback(
    (agentId: number) => {
      setActiveAgentId(agentId);
      setIsOpen(true);
      getOfficeState().selectAndFollow(agentId);
    },
    [getOfficeState],
  );

  const showTab = useCallback(
    (agentId: number) => {
      if (terminalAgentIds.includes(agentId)) setActiveAgentId(agentId);
    },
    [terminalAgentIds],
  );

  const close = useCallback(() => setIsOpen(false), []);

  const [pinnedRaw, setPinned] = useState<number | null>(null);
  // A pin whose terminal closed is simply gone.
  const pinnedId = pinnedRaw !== null && terminalAgentIds.includes(pinnedRaw) ? pinnedRaw : null;
  const togglePin = useCallback(
    (agentId: number) => setPinned((prev) => (prev === agentId ? null : agentId)),
    [],
  );

  // Drag the panel's inner edge (the one facing the office) to resize. The
  // office region is flex-1 beside it, so it reflows to fill what is left.
  const onResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const start = vertical ? e.clientY : e.clientX;
      const startSize = sizePx;
      // Moving toward the office grows the panel: left for a right dock, up
      // for a bottom dock, and the other way round for left/top.
      const sign = dock === 'right' || dock === 'bottom' ? 1 : -1;
      const onMove = (ev: MouseEvent) => {
        const next = startSize + sign * (start - (vertical ? ev.clientY : ev.clientX));
        if (vertical) setPreferredHeightPx(clampDrawerHeight(next, window.innerHeight));
        else setPreferredWidthPx(clampDrawerWidth(next, window.innerWidth));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };
      // Suppress text selection while dragging over the terminal/office.
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [vertical, sizePx, dock],
  );

  // A terminal tab shows the agent's character (front-facing mug shot), so it
  // reads the same palette/hueShift the office assigned that character.
  const getAppearance = useCallback(
    (id: number): AgentAppearance => {
      const ch = getOfficeState().characters.get(id);
      return ch ? { palette: ch.palette, hueShift: ch.hueShift } : DEFAULT_APPEARANCE;
    },
    [getOfficeState],
  );

  const onStatusChange = useCallback((agentId: number, status: TerminalConnectionStatus) => {
    setConnStatuses((prev) => (prev[agentId] === status ? prev : { ...prev, [agentId]: status }));
  }, []);

  // Broken connection (red) wins over the agent's state, for agents with a pane.
  const statusFor = useCallback(
    (id: number): TabStatus | null => {
      const conn = connStatuses[id];
      if (terminalAgentIds.includes(id) && (conn === 'closed' || conn === 'reconnecting')) {
        return 'disconnected';
      }
      return kindOf(id) ?? null;
    },
    [connStatuses, terminalAgentIds, kindOf],
  );

  return {
    activeAgentId,
    shownAgentId,
    lastOpened,
    isOpen,
    sizePx,
    reveal,
    showTab,
    select,
    close,
    pinnedId,
    togglePin,
    onResizeStart,
    getAppearance,
    statusFor,
    onStatusChange,
  };
}
