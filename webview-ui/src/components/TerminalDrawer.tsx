import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { usePaneModes } from '../chat/chatMode.js';
import { ChatPane } from '../chat/ChatPane.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import { isVerticalDock, type TerminalDock } from '../hooks/useTerminalDock.js';
import { sendToAgent } from '../terminal/agentInput.js';
import { useTerminalFontSize } from '../terminal/fontZoom.js';
import type { TerminalSearchHandle } from '../terminal/terminalAddons.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import { useTerminalScheme } from '../terminal/terminalLook.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import type { AgentAppearance, TabStatus } from './AgentCard.js';
import { AgentCardBar } from './AgentCardBar.js';
import { TERMINAL_HEADER_PX, TerminalHeader } from './TerminalHeader.js';
import { TerminalPaneStack } from './TerminalPaneStack.js';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import { terminalSlots } from './terminalSlots.js';

interface TerminalDrawerProps {
  /** Agent ids with a live PTY, in open order. */
  agentIds: number[];
  /** The tabs to list (the workspace on screen); every pane stays mounted
   *  regardless, so switching workspaces never drops a terminal's scrollback. */
  tabIds?: number[];
  /** The pane showing (useTerminalDrawer's resolution); its card is the active tab. */
  shownAgentId: number | null;
  onSelectAgent: (agentId: number) => void;
  onCloseAgent: (agentId: number) => void;
  isOpen: boolean;
  /** Close the panel (the arrow in its header). Reopening happens in App:
   *  selecting an agent — by card or on the board/graph — shows its terminal. */
  onClosePanel: () => void;
  /** The window edge it docks to. */
  dock: TerminalDock;
  /** Open size in px along the dock's axis (user-resizable). Ignored while collapsed. */
  sizePx: number;
  /** Mousedown on the inner-edge drag handle; the hook owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  /** Look up an agent's character appearance for its tab mug shot. */
  getAppearance: (agentId: number) => AgentAppearance;
  /** An agent's tab status dot (null until first activity). */
  statusFor: (agentId: number) => TabStatus | null;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
  /** The agent as the board shows it, for each terminal's header. */
  viewFor: (agentId: number) => AgentView | undefined;
  actions: BoardActions;
  /** The terminal kept beside the active one, if any. */
  pinnedId: number | null;
  onTogglePin: (agentId: number) => void;
  /** The "+" tile under the tabs: a new agent, like "+ Agente". */
  onNewAgent?: () => void;
}

/** Per dock: layout of [cards, panel] (cards always face the office), the
 *  margins that float the panel off the window edges, the drag handle on its
 *  inner edge, and the close arrow. */
const DOCK_LAYOUT: Record<
  TerminalDock,
  { box: string; float: string; handle: string; close: string }
> = {
  right: {
    box: 'h-full flex-row',
    float: 'my-10 mr-10',
    handle: 'top-0 bottom-0 left-0 cursor-col-resize',
    close: '>',
  },
  left: {
    box: 'h-full flex-row-reverse',
    float: 'my-10 ml-10',
    handle: 'top-0 bottom-0 right-0 cursor-col-resize',
    close: '<',
  },
  bottom: {
    box: 'w-full flex-col',
    float: 'mx-10 mb-10',
    handle: 'left-0 right-0 top-0 cursor-row-resize',
    close: 'v',
  },
  top: {
    box: 'w-full flex-col-reverse',
    float: 'mx-10 mt-10',
    handle: 'left-0 right-0 bottom-0 cursor-row-resize',
    close: '^',
  },
};

/**
 * Panel hosting one xterm tab per launched agent, docked to the edge the
 * operator chose (right by default). Each visible terminal has a header that
 * says whose it is and what you can do; one terminal can be pinned so two
 * show at once (stacked at a side, side by side top/bottom).
 *
 * Standalone only — App gates rendering on terminalAvailable, which the server
 * only ever reports over the WebSocket transport. VS Code keeps using its own
 * terminal panel.
 */
export function TerminalDrawer(props: TerminalDrawerProps) {
  const { agentIds, shownAgentId, dock, sizePx, isOpen, pinnedId } = props;
  const fontSizePx = useTerminalFontSize();
  const scheme = useTerminalScheme();
  // Search: one bar at a time, over the terminal it searches.
  const searches = useRef(new Map<number, TerminalSearchHandle>());
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [paneMode, setMode] = usePaneModes();
  // Its session has written nothing yet: show the terminal (chatMode.ts).
  const modeOf = (agentId: number) =>
    paneMode(agentId, props.viewFor(agentId)?.lastRecordAt === undefined);
  if (agentIds.length === 0) return null;
  const openSearch = (agentId: number) => {
    setMode(agentId, 'terminal');
    setSearchFor(agentId);
  };
  const registerSearch = (agentId: number, handle: TerminalSearchHandle | null) => {
    if (handle) searches.current.set(agentId, handle);
    else searches.current.delete(agentId);
  };
  const closeSearch = () => {
    if (searchFor !== null) searches.current.get(searchFor)?.clear();
    setSearchFor(null);
  };
  const layout = DOCK_LAYOUT[dock];
  const vertical = isVerticalDock(dock);

  const visible =
    pinnedId !== null && shownAgentId !== null && pinnedId !== shownAgentId
      ? [pinnedId, shownAgentId]
      : shownAgentId !== null
        ? [shownAgentId]
        : [];
  const slots = terminalSlots(
    visible.length === 2 ? 2 : 1,
    vertical ? 'cols' : 'rows',
    TERMINAL_HEADER_PX,
  );
  const slotOf = (agentId: number) => visible.indexOf(agentId);

  return (
    <div className={`shrink-0 flex ${layout.box}`}>
      <AgentCardBar
        agentIds={props.tabIds ?? agentIds}
        onNewAgent={props.onNewAgent}
        activeAgentId={shownAgentId}
        orientation={vertical ? 'horizontal' : 'vertical'}
        getAppearance={props.getAppearance}
        labelFor={(id) => props.viewFor(id)?.name}
        statusFor={props.statusFor}
        onSelect={props.onSelectAgent}
        onClose={props.onCloseAgent}
      />

      {/* Terminal panel. display:none (not unmount) while closed: the panes
          stay mounted so xterm buffers and sockets survive; unmounting would
          drop the scrollback and force a reconnect on every toggle. */}
      <div
        data-tour="terminal"
        className={`relative overflow-hidden rounded-xl border border-border shadow-soft ${layout.float} ${
          isOpen ? 'block' : 'hidden'
        }`}
        style={{
          ...(vertical ? { height: sizePx } : { width: sizePx }),
          background: scheme.theme.background,
        }}
      >
        {visible.map((agentId, i) => (
          <div key={agentId} style={{ ...slots[i].header, zIndex: 20 }}>
            <TerminalHeader
              view={props.viewFor(agentId)}
              agentId={agentId}
              actions={props.actions}
              pinned={agentId === pinnedId}
              onTogglePin={() => props.onTogglePin(agentId)}
              onSearch={() => openSearch(agentId)}
              mode={modeOf(agentId)}
              onModeChange={(m) => setMode(agentId, m)}
              onClosePanel={i === 0 ? props.onClosePanel : undefined}
              closeGlyph={layout.close}
            />
          </div>
        ))}
        {visible.map((agentId, i) => {
          const view = props.viewFor(agentId);
          if (modeOf(agentId) !== 'chat' || !view) return null;
          return (
            <div key={`chat${agentId}`} style={{ ...slots[i].pane, zIndex: 25 }}>
              <ChatPane
                view={view}
                actions={props.actions}
                // Written into its terminal as if typed there (agentInput.ts).
                onSend={(text) => sendToAgent(agentId, text)}
                onShowTerminal={() => setMode(agentId, 'terminal')}
              />
            </div>
          );
        })}
        {visible.map((agentId, i) => {
          const handle = agentId === searchFor ? searches.current.get(agentId) : undefined;
          return handle ? (
            <div
              key={`buscar${agentId}`}
              style={{ ...slots[i].pane, zIndex: 30, pointerEvents: 'none' }}
            >
              <TerminalSearchBar handle={handle} onClose={closeSearch} />
            </div>
          ) : null;
        })}

        <TerminalPaneStack
          agentIds={agentIds}
          shownAgentId={shownAgentId}
          onStatusChange={props.onStatusChange}
          paneClassName="inset-4"
          fontSizePx={fontSizePx}
          onSearchRequest={openSearch}
          onRegisterSearch={registerSearch}
          placement={(agentId) =>
            slotOf(agentId) >= 0 && modeOf(agentId) === 'terminal'
              ? slots[slotOf(agentId)].pane
              : null
          }
        />

        {/* Drag handle over the edge that faces the office. */}
        <div
          className={`absolute z-40 hover:bg-accent ${layout.handle}`}
          style={
            vertical
              ? { height: TERMINAL_DRAWER_RESIZE_HANDLE_PX }
              : { width: TERMINAL_DRAWER_RESIZE_HANDLE_PX }
          }
          onMouseDown={props.onResizeStart}
          title="Arrastrá para cambiar el tamaño"
        />
        <FontSizeToast sizePx={fontSizePx} />
      </div>
    </div>
  );
}

/** "14 px" for a moment after the font size changes (Ctrl + / Ctrl −). */
function FontSizeToast({ sizePx }: { sizePx: number }) {
  const [shown, setShown] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setShown(true);
    const timer = setTimeout(() => setShown(false), 1200);
    return () => clearTimeout(timer);
  }, [sizePx]);
  if (!shown) return null;
  return (
    <div className="absolute bottom-16 right-16 z-50 soft-panel px-10 py-4 text-sm font-semibold pointer-events-none">
      {sizePx} px
    </div>
  );
}
