import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useEditAgent } from './agents/useEditAgent.js';
import { useSupervisionSync } from './agents/useSupervisionSync.js';
import { showTerminalOf } from './chat/chatMode.js';
import { BroadcastDialog } from './command/BroadcastDialog.js';
import { CommandPalette } from './command/CommandPalette.js';
import { useCommandPaletteShortcut } from './command/usePaletteShortcut.js';
import { AgentCardBar } from './components/AgentCardBar.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { bandUnder, drawerPull, officeRoom, stripOverlap } from './components/cardBar.js';
import { CloseAgentConfirm } from './components/CloseAgentConfirm.js';
import { ConnectionIndicator } from './components/ConnectionIndicator.js';
import { DebugView } from './components/DebugView.js';
import { DirectoryModal } from './components/DirectoryModal.js';
import { HookHealthNotice } from './components/HookHealthNotice.js';
import { LaunchFailedNotice } from './components/LaunchFailedNotice.js';
import { LoadingScreen } from './components/LoadingScreen.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ShutdownScreen } from './components/ShutdownScreen.js';
import { TerminalDrawer } from './components/TerminalDrawer.js';
import { Button } from './components/ui/Button.js';
import { useDayTint } from './effects/dayTint.js';
import { FocusBanner } from './focus/FocusBanner.js';
import { endFocus, isFocused, startFocus } from './focus/focusMode.js';
import { useAdopt } from './handoff/useAdopt.js';
import { useHandOff } from './handoff/useHandOff.js';
import { HistoryPanel, type HistoryTab } from './history/HistoryPanel.js';
import { useDirectoryEditor } from './hooks/useDirectoryEditor.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { useKeyboardViewport } from './hooks/useKeyboardViewport.js';
import { useTerminalDock } from './hooks/useTerminalDock.js';
import { useTerminalDrawer } from './hooks/useTerminalDrawer.js';
import { markYourTurnDone } from './identity/yourTurnStore.js';
import { JarvisBar } from './jarvis/JarvisBar.js';
import { findJarvis, jarvisHome, withoutJarvis } from './jarvis/jarvisRules.js';
import { JarvisVisor } from './jarvis/JarvisVisor.js';
import { useTalkShortcut } from './jarvis/talk.js';
import { useJarvisSpeech } from './jarvis/useJarvisSpeech.js';
import { useLaunchDialog } from './launch/LaunchDialog.js';
import type { TakenLook } from './launch/launchMemory.js';
import { UsageLimitsMeter } from './limits/UsageLimitsMeter.js';
import { MobileShell } from './mobile/MobileShell.js';
import { useMobileShell } from './mobile/useMobileShell.js';
import { playCheerSound, useAgentsInView } from './notificationSound.js';
import { OfficeState } from './office/engine/officeState.js';
import { useOnboarding } from './onboarding/useOnboarding.js';
import { agentLabel } from './permissions/agentLabel.js';
import { PermissionCards } from './permissions/PermissionCards.js';
import { usePermissionCards } from './permissions/usePermissionCards.js';
import { isBrowserRuntime } from './runtime.js';
import { transport } from './transport/index.js';
import { UpdateCorner } from './updates/UpdateCorner.js';
import type { AgentKind } from './views/agentViews.js';
import type { BoardActions } from './views/BoardCard.js';
import { BoardView } from './views/BoardView.js';
import { requestCelebration } from './views/celebrate.js';
import { DayKeeper } from './views/DayKeeper.js';
import { revealOnGraph } from './views/graphReveal.js';
import { GraphView } from './views/GraphView.js';
import { OfficeCheers } from './views/OfficeCheers.js';
import { useOfficeLife } from './views/officeLife.js';
import { useReadMarks } from './views/unread.js';
import { useAgentViews } from './views/useAgentViews.js';
import { useNeedsYouSignals } from './views/useNeedsYouSignals.js';
import { useOfficeKeys } from './views/useOfficeKeys.js';
import { useOfficeView } from './views/useOfficeView.js';
import { useWorkspaceLayer } from './workspaces/useWorkspaceLayer.js';
import { useWorkspaces } from './workspaces/workspaceStore.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

/** Desktop: the office first, then the terminal on the chosen edge. */
const DOCK_DIRECTION = {
  right: 'flex-row',
  left: 'flex-row-reverse',
  bottom: 'flex-col',
  top: 'flex-col-reverse',
} as const;

function App() {
  // Browser runtime (dev or static dist): dispatch mock messages after the
  // useExtensionMessages listener has been registered.
  useEffect(() => {
    // browserMock is for Vite dev mode only (UI prototyping without a server).
    // In standalone server mode, the server sends all state over WebSocket.
    // In VS Code mode, the extension sends all state via postMessage.
    if (isBrowserRuntime && import.meta.env.DEV) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    }
  }, []);

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    directories,
    directoryRejection,
    directorySaved,
    directorySuggestions,
    watchAllSessions,
    setWatchAllSessions,
    hooksInstalled,
    areaMappings,
    setAreaMappings,
    bypassPermissions,
    setBypassPermissions,
    showHostDirectories,
    setShowHostDirectories,
    officeReadOnly,
    terminalAvailable,
    terminalUnavailableReason,
    terminalAgentIds,
    claudeStatus,
    consentRequest,
    dismissConsentRequest,
  } = useExtensionMessages(getOfficeState);
  const [view, setView] = useOfficeView();
  const dayTint = useDayTint();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('dia');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [launchSignal, setLaunchSignal] = useState(0);
  // The visor's «Contestar» focuses what you write to Jarvis in its bar.
  const [jarvisFocus, setJarvisFocus] = useState(0);
  useCommandPaletteShortcut(() => setIsPaletteOpen(true));
  const openHistory = (tab: HistoryTab) => {
    setHistoryTab(tab);
    setIsHistoryOpen(true);
  };
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Mobile shell (phones, touch tablets): office and terminal as sliding
  // full-screen pages with the cards in a bottom bar. Desktop keeps the
  // right-docked drawer.
  const isMobile = useIsMobile();
  // Software keyboard: whether it is up (the key bar shows), and the height
  // to clamp the shell to so the terminal shrinks (and the PTY resizes)
  // instead of hiding its input line under the keys (iOS only — Android
  // resizes the layout viewport itself).
  const keyboard = useKeyboardViewport(isMobile);
  // The office's imperative character selection, mirrored into React so the
  // card bars can restyle the focused agent's card on canvas taps.
  const focusedAgentId = useSyncExternalStore(
    useCallback((onChange: () => void) => getOfficeState().subscribeSelection(onChange), []),
    () => getOfficeState().selectedAgentId,
  );

  // Standalone only: every input here stays false/empty under VS Code. Owns the
  // active tab on both shells; the desktop-only bits (isOpen, width, resize)
  // are simply unread on mobile, where the sliding track plays the drawer.
  // Where the terminal panel docks (desktop), chosen in Ajustes.
  const [terminalDock, setTerminalDock] = useTerminalDock();
  // The tab dots read the same state the board shows; the views are built
  // further down, so the drawer reads them through this ref.
  const kindRef = useRef<(id: number) => AgentKind | undefined>(() => undefined);
  const kindOf = useCallback((id: number) => kindRef.current(id), []);
  // Jarvis's terminal never opens by itself (it has no tab); known further down.
  const jarvisIdRef = useRef<number | undefined>(undefined);
  const isJarvisTerminal = useCallback((id: number) => id === jarvisIdRef.current, []);
  const terminalDrawer = useTerminalDrawer({
    terminalAgentIds,
    getOfficeState,
    kindOf,
    dock: terminalDock,
    isHidden: isJarvisTerminal,
  });

  // Every launch (desktop drawer and mobile bar) asks name and colour first,
  // avoiding the names and colours already in the office (views come later).
  const takenRef = useRef<() => TakenLook[]>(() => []);
  const takenLooks = useCallback(() => takenRef.current(), []);
  // One Jarvis per office: the dialog stops offering it once there is one.
  const hasJarvisRef = useRef(false);
  const jarvisTaken = useCallback(() => hasJarvisRef.current, []);
  const { requestLaunch, launchDialog } = useLaunchDialog(takenLooks, jarvisTaken);
  const launchIntoDirectory = requestLaunch;
  const mobileShell = useMobileShell({
    getOfficeState,
    terminalAgentIds,
    drawer: terminalDrawer,
    focusedAgentId,
    launchAgent: launchIntoDirectory,
  });

  const directoryEditor = useDirectoryEditor({
    directories,
    directoryRejection,
    directorySaved,
    areaMappings,
    setAreaMappings,
    getOfficeState,
  });

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleSelectAgent = useCallback((id: number) => {
    transport.send({ type: 'focusAgent', id });
  }, []);

  // The Settings surface renders one provider today; its checkbox binds to
  // the Claude row of the per-provider install-state map.
  const claudeHooksInstalled = hooksInstalled['claude'] === true;

  // Closing kills the session: every close goes through the confirmation.
  const [closingAgentId, setClosingAgentId] = useState<number | null>(null);
  const handleCloseAgent = useCallback((id: number) => setClosingAgentId(id), []);
  const confirmCloseAgent = useCallback(() => {
    if (closingAgentId !== null) transport.send({ type: 'closeAgent', id: closingAgentId });
    setClosingAgentId(null);
  }, [closingAgentId]);

  const describePermissionAgent = useCallback(
    (card: { id?: number; cwd?: string }) => agentLabel(getOfficeState(), card.id, card.cwd),
    [],
  );
  const permissionCards = usePermissionCards(describePermissionAgent);

  const nameOfAgent = useCallback((id: number) => agentLabel(getOfficeState(), id), []);
  const { requestHandOff, handOffTo, handOffDialog } = useHandOff({
    terminalAgentIds,
    nameOf: nameOfAgent,
  });
  const { requestAdopt, adoptDialog } = useAdopt(nameOfAgent);
  const agentViews = useAgentViews({
    getOfficeState,
    agents,
    agentTools,
    subagentCharacters,
    subagentTools,
    permissions: permissionCards.cards,
    terminalAgentIds,
    agentStatuses,
  });
  kindRef.current = (id) => agentViews.find((v) => v.id === id)?.kind;
  takenRef.current = () => agentViews.map((v) => ({ name: v.name, palette: v.palette }));
  // Jarvis has no avatar: everything that shows agents (board, graph, lists,
  // tabs) gets the office without it; it lives in its bar and its visor.
  const jarvis = findJarvis(agentViews);
  hasJarvisRef.current = jarvis !== undefined;
  const officeViews = withoutJarvis(agentViews, jarvis);
  // Its voice: it speaks when a turn of its ends; Alt+J talks to it.
  useJarvisSpeech(jarvis);
  useTalkShortcut(officeReadOnly ? undefined : jarvis?.id);
  const workspaceState = useWorkspaces();
  const { requestEdit, editDialog } = useEditAgent(agentViews);
  useSupervisionSync(agentViews, workspaceState);
  useNeedsYouSignals(agentViews);
  useOfficeLife(agentViews);
  // A chat or terminal on screen is read ("Terminó" loses its dot) and its
  // plin is not news: the drawer's panes on desktop, the terminal page on a phone.
  const onScreen = isMobile
    ? mobileShell.view === 'terminal'
      ? [terminalDrawer.shownAgentId]
      : []
    : terminalDrawer.isOpen
      ? [terminalDrawer.shownAgentId, terminalDrawer.pinnedId]
      : [];
  useReadMarks(agentViews, onScreen);
  useAgentsInView(onScreen);

  const { reveal: revealTerminal } = terminalDrawer;
  const { showTerminal: showMobileTerminal } = mobileShell;
  const handleClick = useCallback(
    (agentId: number) => {
      // If clicked agent is a sub-agent, focus the parent's terminal instead
      const os = getOfficeState();
      const focusId = os.terminalOwnerOf(agentId);
      transport.send({ type: 'focusAgent', id: focusId });
      // Standalone: focusAgent is a no-op server-side (there's no editor to
      // raise a panel in), so focus is resolved here — reveal the agent's tab
      // (desktop drawer) and slide to the terminal page (mobile). A Teammate
      // without a terminal of its own runs in its Lead's, so it reveals that
      // one (VS Code resolves the same way server-side).
      const leadId = os.characters.get(focusId)?.leadAgentId;
      const terminalId =
        leadId !== undefined && !terminalAgentIds.includes(focusId) ? leadId : focusId;
      if (terminalAgentIds.includes(terminalId)) {
        revealTerminal(terminalId);
        if (isMobile) showMobileTerminal();
      } else if (terminalAvailable && !officeReadOnly) {
        // It runs outside the office (VS Code, a console): there is no
        // terminal here to show, so say so and offer to bring it in rather
        // than ignore the click.
        requestAdopt(focusId);
      }
    },
    [
      terminalAgentIds,
      isMobile,
      revealTerminal,
      showMobileTerminal,
      terminalAvailable,
      officeReadOnly,
      requestAdopt,
    ],
  );
  // Workspaces: the views show one group of agents at a time (desktop).
  const workspaces = useWorkspaceLayer({
    enabled: !isMobile && !isDebugMode,
    views: officeViews,
    terminalAgentIds,
    shownAgentId: terminalDrawer.shownAgentId,
    showTab: terminalDrawer.showTab,
    directories,
  });
  // Opening an agent from anywhere global (Alt+N, Ctrl+K, the history)
  // first switches to a workspace where it shows; the graph, if on screen,
  // selects it and brings it into view.
  const { revealIn } = workspaces;
  const openAgent = useCallback(
    (agentId: number) => {
      revealIn(agentId);
      handleClick(agentId);
      revealOnGraph(agentId);
    },
    [revealIn, handleClick],
  );
  useOfficeKeys(workspaces.shown, openAgent, officeViews);
  // A terminal tab opens its agent too: the graph follows.
  const { select: selectTerminalTab } = terminalDrawer;
  const selectTab = useCallback(
    (agentId: number) => {
      selectTerminalTab(agentId);
      revealOnGraph(agentId);
    },
    [selectTerminalTab],
  );
  // Jarvis's terminal is no tab: it shows only while you opened it (from its
  // conversation), and stays mounted so the bar can write to it.
  const jarvisId = jarvis?.id;
  jarvisIdRef.current = jarvisId;
  // A Jarvis just launched opens its terminal before the office knows it is
  // Jarvis (its identity comes right after): put that away, once.
  const autoOpened = terminalDrawer.lastOpened;
  const handledAutoOpen = useRef(-1);
  const { close: closeDrawer, showTab: showDrawerTab } = terminalDrawer;
  useEffect(() => {
    if (jarvisId === undefined || autoOpened?.agentId !== jarvisId) return;
    if (handledAutoOpen.current === autoOpened.seq) return;
    handledAutoOpen.current = autoOpened.seq;
    const other = terminalAgentIds.find((id) => id !== jarvisId);
    if (other !== undefined) showDrawerTab(other);
    closeDrawer();
  }, [jarvisId, autoOpened, closeDrawer, showDrawerTab, terminalAgentIds]);
  // Its tab shows only while its terminal is open on purpose («Ver la terminal»).
  const shownTabId = terminalDrawer.isOpen ? terminalDrawer.shownAgentId : null;
  const drawerTabIds = (workspaces.tabIds ?? terminalAgentIds).filter(
    (id) => id !== jarvisId || id === shownTabId,
  );
  // The drawer's strip of tabs (see-through) lies over the office's edge.
  const stripOver = stripOverlap(
    terminalDock,
    terminalAvailable &&
      !isMobile &&
      terminalAgentIds.length > 0 &&
      (drawerTabIds.length > 0 || !officeReadOnly),
  );
  const summonHome = jarvisHome(directories, officeViews);
  const summonJarvis =
    !officeReadOnly && terminalAvailable && summonHome
      ? () => requestLaunch(summonHome, true)
      : undefined;

  // First run: the welcome (checks, a folder, the first agent), then the tour.
  const onboarding = useOnboarding({
    ready: layoutReady && terminalAvailable && !officeReadOnly && !isMobile,
    agents,
    directories,
    terminalAgentIds,
    welcome: {
      claude: claudeStatus,
      consent: consentRequest,
      onConsentAnswered: dismissConsentRequest,
      directories,
      suggestions: directorySuggestions,
      saved: directorySaved,
      rejection: directoryRejection,
    },
  });

  // Card click when there is no terminal pane to switch (VS Code, or a
  // watch-only standalone session): ask the host to raise the agent's own
  // terminal — VS Code shows the editor terminal, standalone has nothing to
  // show — and select its character so the office follows the click.
  const handleCardSelect = useCallback((agentId: number) => {
    transport.send({ type: 'focusAgent', id: agentId });
    getOfficeState().selectAndFollow(agentId);
  }, []);

  const officeState = getOfficeState();

  if (!layoutReady) {
    return <LoadingScreen />;
  }

  // What a card (board, or the graph's side panel) lets you do with an agent.
  // A read-only viewer only looks: the server would refuse every action.
  const agentActions: BoardActions = officeReadOnly
    ? { onSelect: handleClick }
    : {
        onSelect: handleClick,
        onAllow: permissionCards.allow,
        onDeny: (requestId) => permissionCards.deny(requestId),
        onAdopt: terminalAvailable ? requestAdopt : undefined,
        onHandOff: requestHandOff,
        onHandOffTo: handOffTo,
        onClose: handleCloseAgent,
        onEdit: requestEdit,
        onOpenTerminal: (id) => {
          showTerminalOf(id);
          handleClick(id);
        },
        onYourTurnDone: (turnId) => {
          markYourTurnDone(turnId);
          const done = agentViews.find((v) => v.yourTurnId === turnId);
          if (done) requestCelebration(done.id);
          void playCheerSound();
        },
      };

  // Jarvis's band. On a computer it runs the whole width of the window, under
  // the office and the terminals (asked for 2026-10-22: its chat ended short
  // of the right edge, beside the strip of tabs); on a phone it closes the
  // office page.
  const jarvisBand =
    !isDebugMode && (terminalAvailable || jarvis) ? (
      <div
        className="shrink-0 border-t border-border bg-bg-dark *:border-t-0"
        style={isMobile ? bandUnder(stripOver) : undefined}
      >
        <JarvisBar
          jarvis={jarvis}
          actions={agentActions}
          onSummon={summonJarvis}
          focusSignal={jarvisFocus}
        />
      </div>
    ) : null;

  // The office region is shared by both shells: desktop mounts it as the
  // flexing left half of the split view (the terminal panel docks beside it);
  // mobile mounts it as the first page of the sliding track.
  const officeRegion = (
    <div
      // @container: the toolbar's usage meter shrinks with the office, not the window.
      className={`@container relative overflow-hidden flex flex-col ${isMobile ? 'w-full h-full' : 'flex-1 min-w-0 min-h-0'}`}
      style={officeRoom(stripOver)}
    >
      {/* The office itself; Jarvis's bar sits under it, in flow. */}
      <div className="relative flex-1 min-h-0">
        {!isDebugMode ? (
          // The two views replace the pixel office (decided 2026-10-19): the
          // board for managing, the live graph for how agents work together.
          <div className="absolute inset-0">
            {view === 'tablero' ? (
              <BoardView views={workspaces.shown} actions={agentActions} space={workspaces.space} />
            ) : (
              <GraphView views={workspaces.shown} actions={agentActions} under={stripOver} />
            )}
            {workspaces.bar}
          </div>
        ) : (
          <DebugView
            agents={agents}
            selectedAgent={selectedAgent}
            agentTools={agentTools}
            agentStatuses={agentStatuses}
            subagentTools={subagentTools}
            officeState={officeState}
            onSelectAgent={handleSelectAgent}
          />
        )}

        {isHistoryOpen && !isDebugMode && (
          <HistoryPanel
            tab={historyTab}
            onTabChange={setHistoryTab}
            views={officeViews}
            onClose={() => setIsHistoryOpen(false)}
            onOpenAgent={openAgent}
          />
        )}
        {!isMobile && !isDebugMode && <DayKeeper views={agentViews} />}
        {!isMobile && <FocusBanner />}
        {/* The desktop app's updates (nothing in a browser). */}
        {!isMobile && <UpdateCorner views={agentViews} permissions={permissionCards.cards} />}

        {officeReadOnly && (
          <div className="absolute mobile-safe-top left-1/2 -translate-x-1/2 z-10 text-sm text-text-muted pointer-events-none select-none whitespace-nowrap">
            Solo lectura
          </div>
        )}

        {/* A read-only office gets no toolbar: launching, layout editing and every
          setting would be refused by the server anyway. */}
        {!isMobile && !officeReadOnly && (
          <BottomToolbar
            view={view}
            onViewChange={setView}
            isSettingsOpen={isSettingsOpen}
            onToggleSettings={() => setIsSettingsOpen((v) => !v)}
            isHistoryOpen={isHistoryOpen}
            onToggleHistory={() => setIsHistoryOpen((v) => !v)}
            launchSignal={launchSignal}
            directories={directories}
            onAddDirectory={directoryEditor.add}
            onEditDirectory={directoryEditor.edit}
            terminalAvailable={terminalAvailable}
            terminalUnavailableReason={terminalUnavailableReason}
            onLaunch={requestLaunch}
          />
        )}

        {/* Mobile: Settings floats top-left (the layout editor stays desktop-
            only — its tools are drag/hover-driven). */}
        {isMobile && !isDebugMode && !officeReadOnly && (
          <div className="absolute mobile-safe-top left-8 z-20 flex items-center gap-6">
            <Button
              size="sm"
              variant={isSettingsOpen ? 'active' : 'default'}
              className="border-border! shadow-soft"
              onClick={() => setIsSettingsOpen((v) => !v)}
            >
              Ajustes
            </Button>
            <UsageLimitsMeter floating />
          </div>
        )}

        <ConnectionIndicator />
        {/* Claude Code's hooks failing to reach us: say so, offer to reinstall. */}
        <HookHealthNotice
          onReinstall={
            officeReadOnly || !('claude' in hooksInstalled)
              ? undefined
              : () =>
                  transport.send({ type: 'setHooksEnabled', providerId: 'claude', enabled: true })
          }
        />
        {!isDebugMode && (
          <JarvisVisor
            jarvis={jarvis}
            actions={agentActions}
            onAnswer={() => setJarvisFocus((n) => n + 1)}
          />
        )}
      </div>
      {isMobile && jarvisBand}
    </div>
  );

  return (
    // Desktop: split view — the office region flexes to fill the space left of
    // the terminal panel. Mobile: a column — the sliding office/terminal track
    // on top, the agent-card bar pinned along the bottom.
    <div
      className="w-full h-full relative overflow-hidden flex flex-col"
      // The hour's backdrop behind everything, so the card bar and the floating
      // terminal panel sit on the same paper as the board.
      style={{
        background: `var(${dayTint})`,
        ...(isMobile && keyboard.clampHeight !== null ? { height: keyboard.clampHeight } : {}),
      }}
    >
      {isMobile ? (
        <MobileShell
          office={officeRegion}
          shell={mobileShell}
          drawer={terminalDrawer}
          agentIds={agents}
          terminalAgentIds={terminalAgentIds}
          focusedAgentId={focusedAgentId}
          terminalAvailable={terminalAvailable}
          terminalUnavailableReason={terminalUnavailableReason}
          directories={directories}
          onAddDirectory={directoryEditor.add}
          onEditDirectory={directoryEditor.edit}
          onCloseAgent={handleCloseAgent}
          keyboardOpen={keyboard.keyboardOpen}
        />
      ) : (
        <>
          <div className={`flex-1 min-h-0 flex ${DOCK_DIRECTION[terminalDock]}`}>
            {officeRegion}

            {/* Standalone with a terminal: terminalAvailable is only ever true when
              the server reports a working PTY to a tokened session, which VS
              Code's surface never does. In flow as a flex sibling so the office
              region reflows beside it instead of being overlaid.

              Otherwise (VS Code, or a watch-only standalone session) the card
              bar stands alone with every agent in the office, external sessions
              included — the at-a-glance "who needs attention" strip, with a
              click raising the agent's editor terminal where there is one. */}
            {terminalAvailable ? (
              <TerminalDrawer
                agentIds={terminalAgentIds}
                onNewAgent={officeReadOnly ? undefined : () => setLaunchSignal((n) => n + 1)}
                tabIds={drawerTabIds}
                shownAgentId={terminalDrawer.shownAgentId}
                onSelectAgent={selectTab}
                onCloseAgent={handleCloseAgent}
                // A space with no agents of its own shows no one else's terminal
                // (the panes stay mounted, only hidden).
                isOpen={terminalDrawer.isOpen && (workspaces.tabIds?.length ?? 1) > 0}
                onClosePanel={terminalDrawer.close}
                dock={terminalDock}
                style={drawerPull(stripOver)}
                sizePx={terminalDrawer.sizePx}
                onResizeStart={terminalDrawer.onResizeStart}
                getAppearance={terminalDrawer.getAppearance}
                statusFor={terminalDrawer.statusFor}
                onStatusChange={terminalDrawer.onStatusChange}
                viewFor={(id) => agentViews.find((v) => v.id === id)}
                actions={agentActions}
                pinnedId={terminalDrawer.pinnedId}
                onTogglePin={terminalDrawer.togglePin}
              />
            ) : (
              !isDebugMode && (
                <AgentCardBar
                  agentIds={agents}
                  onNewAgent={officeReadOnly ? undefined : () => setLaunchSignal((n) => n + 1)}
                  focusedAgentId={focusedAgentId}
                  getAppearance={terminalDrawer.getAppearance}
                  labelFor={(id) => agentViews.find((v) => v.id === id)?.name}
                  statusFor={terminalDrawer.statusFor}
                  onSelect={handleCardSelect}
                  onClose={handleCloseAgent}
                />
              )
            )}
          </div>
          {jarvisBand}
        </>
      )}

      {launchDialog}
      {workspaces.dialog}
      {handOffDialog}
      {adoptDialog}
      {editDialog}
      <LaunchFailedNotice />
      {!isMobile && !officeReadOnly && (
        <>
          <CommandPalette
            open={isPaletteOpen}
            onClose={() => setIsPaletteOpen(false)}
            views={officeViews}
            spaceOf={workspaces.spaceOf}
            onOpenAgent={openAgent}
            onNewAgent={() => setLaunchSignal((n) => n + 1)}
            onSetView={setView}
            onOpenHistory={() => openHistory('dia')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onBroadcast={() => setIsBroadcastOpen(true)}
            onToggleFocus={() => (isFocused() ? endFocus() : startFocus())}
            onOpenPrs={() => openHistory('prs')}
          />
          <BroadcastDialog
            open={isBroadcastOpen}
            onClose={() => setIsBroadcastOpen(false)}
            views={officeViews}
          />
        </>
      )}
      {!isMobile && !isDebugMode && (
        <OfficeCheers views={officeViews} onOpenHistory={() => setIsHistoryOpen(true)} />
      )}
      {/* The board answers permissions inside each card; the graph keeps the
          floating cards so a request is never out of reach. */}
      {view !== 'tablero' && (
        <PermissionCards
          // Jarvis asks in its visor and its bar.
          cards={permissionCards.cards.filter((c) => c.id === undefined || c.id !== jarvisId)}
          describeAgent={describePermissionAgent}
          onAllow={permissionCards.allow}
          onDeny={permissionCards.deny}
        />
      )}
      <CloseAgentConfirm
        agentLabel={closingAgentId === null ? null : agentLabel(getOfficeState(), closingAgentId)}
        onConfirm={confirmCloseAgent}
        onCancel={() => setClosingAgentId(null)}
      />

      {/* Rendered at the composition root, not inside a launch surface: the
          drawer that opens it lives in BottomToolbar on desktop and
          MobileAgentBar on mobile, and both close as soon as it appears. */}
      <DirectoryModal
        isOpen={directoryEditor.modal.open}
        editing={directoryEditor.modal.editing}
        error={directoryEditor.error}
        suggestions={directorySuggestions}
        assignedAreas={[]}
        onSubmit={directoryEditor.submit}
        onDelete={directoryEditor.remove}
        onClose={directoryEditor.close}
      />

      {onboarding.element}
      {isShuttingDown && <ShutdownScreen />}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDebugMode={isDebugMode}
        terminalDock={terminalAvailable && !isMobile ? terminalDock : undefined}
        onTerminalDockChange={setTerminalDock}
        onShutdown={
          terminalAvailable && !isMobile
            ? () => {
                transport.send({ type: 'shutdownOffice' });
                setIsSettingsOpen(false);
                setIsShuttingDown(true);
              }
            : undefined
        }
        onToggleDebugMode={handleToggleDebugMode}
        onShowGuide={
          isMobile
            ? undefined
            : () => {
                setIsSettingsOpen(false);
                onboarding.showTour();
              }
        }
        onShowIntro={
          isMobile
            ? undefined
            : () => {
                setIsSettingsOpen(false);
                onboarding.showIntro();
              }
        }
        watchAllSessions={watchAllSessions}
        onToggleWatchAllSessions={() => {
          const newVal = !watchAllSessions;
          setWatchAllSessions(newVal);
          transport.send({ type: 'setWatchAllSessions', enabled: newVal });
        }}
        hooksInstalled={claudeHooksInstalled}
        onToggleHooksEnabled={() => {
          // Toggle the DISPLAYED state (actual install), not the preference: when the two disagree — preference on,
          // nothing installed while consent is pending — toggling the preference would turn hooks OFF for a user
          // asking for ON. No optimistic local update either; both backends answer with the truthful hooksStatus this
          // checkbox renders, so it lands correct instead of flickering when an install fails. The providerId is
          // ECHOED from that row (never originated here), so nothing sends until the row has arrived.
          const [rowProviderId] =
            Object.entries(hooksInstalled).find(([id]) => id === 'claude') ?? [];
          if (rowProviderId !== undefined) {
            transport.send({
              type: 'setHooksEnabled',
              providerId: rowProviderId,
              enabled: !claudeHooksInstalled,
            });
          }
        }}
        bypassPermissions={bypassPermissions}
        onToggleBypassPermissions={() => {
          const newVal = !bypassPermissions;
          setBypassPermissions(newVal);
          transport.send({ type: 'setBypassPermissions', enabled: newVal });
        }}
        showHostDirectories={showHostDirectories}
        onToggleShowHostDirectories={() => {
          const newVal = !showHostDirectories;
          setShowHostDirectories(newVal);
          transport.send({ type: 'setShowHostDirectories', enabled: newVal });
        }}
      />
    </div>
  );
}

export default App;
