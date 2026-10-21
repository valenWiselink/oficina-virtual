import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE_PX,
  TERMINAL_MIN_CONTRAST,
  TERMINAL_OVERVIEW_RULER_PX,
  TERMINAL_RESIZE_DEBOUNCE_MS,
  TERMINAL_SCROLLBACK_LINES,
  TERMINAL_URL_PATTERN,
} from '../constants.js';
import { registerAgentInput } from '../terminal/agentInput.js';
import { attachClipboardInput } from '../terminal/clipboardInput.js';
import { zoomTerminalFont } from '../terminal/fontZoom.js';
import { pasteText } from '../terminal/pasteText.js';
import { findRelativePaths, findWindowsPaths } from '../terminal/pathLinks.js';
import { attachPromptMarks } from '../terminal/promptMarks.js';
import {
  attachSearch,
  attachWebgl,
  type TerminalSearchHandle,
} from '../terminal/terminalAddons.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import { TerminalConnection } from '../terminal/terminalClient.js';
import { isTypingInTerminal } from '../terminal/terminalDom.js';
import { terminalLinkOpener } from '../terminal/terminalLinks.js';
import { useTerminalColorize, useTerminalScheme } from '../terminal/terminalLook.js';
import { attachTouchInput } from '../terminal/touchInput.js';
import { transport } from '../transport/index.js';
import { InputDroppedNotice } from './InputDroppedNotice.js';

interface TerminalPaneProps {
  agentId: number;
  /** Hidden panes stay mounted so their xterm buffer and socket survive tab
   *  switches — unmounting would drop the scrollback and force a reconnect. */
  isActive: boolean;
  onStatusChange?: (agentId: number, status: TerminalConnectionStatus) => void;
  /** Override the terminal font size (mobile uses a smaller face for columns). */
  fontSizePx?: number;
  /** Focus xterm when the pane opens/activates. Mobile passes false: focusing
   *  raises the software keyboard over half the screen on every view switch —
   *  there, tapping the terminal itself is what summons the keyboard. */
  autoFocus?: boolean;
  /** Ctrl+Shift+F inside this pane (the drawer opens its search bar). */
  onSearchRequest?: (agentId: number) => void;
  /** Hands the caller this pane's search (null on teardown). */
  onRegisterSearch?: (agentId: number, handle: TerminalSearchHandle | null) => void;
  /** Hands the caller this pane's input handle (null on teardown) — how the
   *  mobile key bar injects keys the software keyboard doesn't have and
   *  pastes clipboard text. */
  onRegisterInput?: (agentId: number, handle: TerminalInputHandle | null) => void;
}

/** Said in the terminal when what you wrote while it reconnected never went. */
const INPUT_DROPPED_NOTE =
  '[No le llegó lo que escribiste mientras la terminal se reconectaba. Escribilo de nuevo.]';

/** Ways to feed input into a pane's PTY from outside the terminal itself. */
export interface TerminalInputHandle {
  /** Write raw bytes (key sequences) straight to the PTY, as typed: while it
   *  reconnects they are dropped (terminalClient.ts). */
  send: (data: string) => void;
  /** Paste text through xterm, as typed: wrapped in bracketed-paste markers
   *  when the running app has turned that mode on — Claude Code has, and
   *  without the markers a multiline paste would submit at its first newline. */
  paste: (data: string) => void;
  /** A whole message: pasted, then Enter. While the terminal reconnects it
   *  waits (up to 30 s); resolves whether it got there. */
  submit: (text: string) => Promise<boolean>;
}

/**
 * One xterm.js instance bound to one agent's PTY.
 *
 * xterm is imperative and owns its own DOM, so it lives outside React state and
 * is driven entirely through refs — the same pattern OfficeCanvas uses for the
 * game loop.
 */
export function TerminalPane({
  agentId,
  isActive,
  onStatusChange,
  fontSizePx = TERMINAL_FONT_SIZE_PX,
  autoFocus = true,
  onSearchRequest,
  onRegisterSearch,
  onRegisterInput,
}: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // What you typed while it reconnected did not go (InputDroppedNotice).
  const [droppedAt, setDroppedAt] = useState<number | null>(null);
  const clearDropped = useCallback(() => setDroppedAt(null), []);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);

  // Keep the latest callback reachable without making it an effect dependency:
  // a caller passing an inline arrow would otherwise tear down the terminal and
  // reconnect the socket on every parent render.
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const registerInputRef = useRef(onRegisterInput);
  registerInputRef.current = onRegisterInput;
  // Read only when the terminal first opens — as a dependency, flipping it
  // would dispose the terminal and reconnect the socket for nothing.
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  const searchRef = useRef(onSearchRequest);
  searchRef.current = onSearchRequest;
  // The size the terminal opens with; later changes go through the font
  // effect below, which re-measures in place instead of rebuilding it.
  const fontSizeRef = useRef(fontSizePx);
  fontSizeRef.current = fontSizePx;
  const fitNowRef = useRef<(() => void) | null>(null);
  // The colour scheme (Ajustes). Changes repaint in place, like the font size.
  const scheme = useTerminalScheme();
  const colorize = useTerminalColorize();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  const registerSearchRef = useRef(onRegisterSearch);
  registerSearchRef.current = onRegisterSearch;
  // GPU drawing, held only while the pane is on screen (see attachWebgl).
  const webglRef = useRef<(() => void) | null>(null);
  const ensureWebgl = () => {
    const term = termRef.current;
    if (!isActiveRef.current || !term?.element || webglRef.current) return;
    webglRef.current = attachWebgl(term);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const openLink = terminalLinkOpener(window.open.bind(window), (path) =>
      transport.send({ type: 'openPath', path, id: agentId }),
    );
    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: fontSizeRef.current,
      theme: { ...schemeRef.current.theme },
      minimumContrastRatio: TERMINAL_MIN_CONTRAST,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      cursorBlink: true,
      // Search highlights and the user's own messages (promptMarks) use
      // xterm 5's decoration API, which is still marked proposed.
      allowProposedApi: true,
      overviewRulerWidth: TERMINAL_OVERVIEW_RULER_PX,
      // OSC 8 hyperlinks. Without this xterm's built-in activator opens any
      // scheme behind a confirm(); see terminalLinkOpener.
      linkHandler: { activate: openLink },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Plain URLs printed as text (most of what an agent prints) become clickable.
    term.loadAddon(new WebLinksAddon(openLink, { urlRegex: TERMINAL_URL_PATTERN }));
    // Windows paths too: a click shows them in the Explorer (never runs them).
    term.registerLinkProvider({
      provideLinks: (y, callback) => {
        const line = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? '';
        // Relative ones ("migrations/x.sql") are the agent's: the office looks
        // them up in its folder and repos.
        const links = [...findWindowsPaths(line), ...findRelativePaths(line)].map((m) => ({
          range: { start: { x: m.start + 1, y }, end: { x: m.end, y } },
          text: m.text,
          decorations: { underline: true, pointerCursor: true },
          activate: () => transport.send({ type: 'openPath', path: m.text, id: agentId }),
        }));
        callback(links.length > 0 ? links : undefined);
      },
    });
    const search = attachSearch(term, () => schemeRef.current.search);
    registerSearchRef.current?.(agentId, search.handle);
    termRef.current = term;
    fitRef.current = fit;

    const connection = new TerminalConnection(agentId, {
      onOutput: (data) => term.write(data),
      onReplay: (data, cols, rows) => {
        // Reproduce the server's screen exactly: size the terminal to the
        // geometry the snapshot was serialized at, then write it after an
        // in-band full reset (RIS). RIS rather than term.reset() so the clear
        // is ordered within xterm's async write queue and works before open();
        // resize-first so the snapshot lays out at its own geometry. The fit
        // then reconciles with the actual container — if that's a real change,
        // the PTY gets a SIGWINCH and the TUI repaints itself.
        term.resize(cols, rows);
        term.write(`\x1bc${data}`);
        scheduleFit();
      },
      onExit: (exitCode) => {
        term.write(`\r\n\x1b[90m[el proceso terminó con código ${String(exitCode)}]\x1b[0m\r\n`);
      },
      onStatusChange: (status) => statusRef.current?.(agentId, status),
      onInputDropped: () => {
        term.write(`\r\n\x1b[90m${INPUT_DROPPED_NOTE}\x1b[0m\r\n`);
        setDroppedAt(Date.now());
      },
    });
    void connection.connect();

    term.onData((data) => connection.write(data));
    // Keyboard copy (verbatim; Alt+C = copy as text) and paste, OSC 52 writes.
    const detachClipboard = attachClipboardInput(term, {
      isActive: () => isActiveRef.current,
      onShortcut: (shortcut) => {
        if (shortcut === 'search') searchRef.current?.(agentId);
        else zoomTerminalFont(shortcut === 'zoomIn' ? 1 : shortcut === 'zoomOut' ? -1 : 0);
      },
    });
    const input: TerminalInputHandle = {
      send: (data) => connection.write(data),
      paste: (data) => {
        try {
          term.paste(data);
        } catch {
          // A pane never shown is not opened yet: xterm has already handed the
          // paste to onData, then fails clearing a textarea it does not have.
        }
      },
      // Not through term.paste: that is typing, which a reconnect drops. The
      // paste is encoded when it goes, as the app wants it then.
      submit: (text) =>
        new Promise((resolve) => {
          term.scrollToBottom();
          connection.sendMessage(() => pasteText(text, term.modes.bracketedPasteMode), resolve);
        }),
    };
    registerInputRef.current?.(agentId, input);
    // Anything in the office can write to this agent (agentInput.ts).
    registerAgentInput(agentId, input);

    // Touch: scroll + flick, tap to focus / open a URL, long-press selection
    // with handles and a copy pill (see touchGesture.ts for the why).
    const detachTouch = attachTouchInput(term, host, {
      openLink,
      fallbackRowHeightPx: fontSizeRef.current,
    });

    // Debounced: ResizeObserver fires per frame during a drag, and every resize
    // is a syscall on the PTY plus a full TUI repaint.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let verifyFrame: number | null = null;
    const applyFit = () => {
      // A hidden pane has zero dimensions; fit() would compute a nonsense size
      // and resize the PTY to it.
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      // Deferred open: xterm measures its cell grid the moment open() runs,
      // and this pane mounts inside a display:none panel (App only flips the
      // drawer open in an effect that runs after ours). Measuring while
      // hidden records garbage cell metrics that poison the first visible
      // fit() — the terminal squeezed into a ~10-column strip until the user
      // jiggles the container. Opening on the first fit that sees real
      // dimensions measures against real layout instead. Output that arrived
      // before open (the scrollback replay) is buffered by xterm and flushed
      // here.
      if (!term.element) {
        term.open(host);
        if (autoFocusRef.current) term.focus();
        ensureWebgl();
      }
      try {
        fit.fit();
        connection.resize(term.cols, term.rows);
      } catch {
        // fit() throws if the element is mid-teardown; the next tick recovers.
      }
      // Self-heal: one frame later, if the grid no longer matches what the
      // host's dimensions call for (metrics re-measured, layout shifted under
      // us), fit again rather than waiting for a user resize. Converges: fit()
      // applies exactly the proposal, so a stable layout passes this check on
      // the next pass and stops rescheduling.
      if (verifyFrame !== null) cancelAnimationFrame(verifyFrame);
      verifyFrame = requestAnimationFrame(() => {
        verifyFrame = null;
        const proposed = fit.proposeDimensions();
        if (proposed && (proposed.cols !== term.cols || proposed.rows !== term.rows)) {
          applyFit();
        }
      });
    };
    const scheduleFit = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyFit, TERMINAL_RESIZE_DEBOUNCE_MS);
    };

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(host);
    applyFit();
    fitNowRef.current = applyFit;

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (verifyFrame !== null) cancelAnimationFrame(verifyFrame);
      detachTouch();
      detachClipboard();
      observer.disconnect();
      registerInputRef.current?.(agentId, null);
      registerAgentInput(agentId, null);
      registerSearchRef.current?.(agentId, null);
      webglRef.current?.();
      webglRef.current = null;
      search.dispose();
      connection.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      fitNowRef.current = null;
    };
  }, [agentId]);

  // A new font size: xterm re-measures its cells in place, then the grid is
  // re-fitted (and the PTY told) — the scrollback and the session stay.
  useEffect(() => {
    const term = termRef.current;
    if (!term || term.options.fontSize === fontSizePx) return;
    term.options.fontSize = fontSizePx;
    fitNowRef.current?.();
  }, [fontSizePx]);

  // The scheme: colours swap in place; the user's messages are re-marked in
  // the new scheme's colours (after the mount effect, which creates the terminal).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = { ...scheme.theme };
    return attachPromptMarks(term, scheme.prompt, colorize ? scheme.paint : undefined);
  }, [agentId, scheme, colorize]);

  // Becoming visible: the pane had no dimensions while hidden, so re-fit and
  // focus now that it does.
  useEffect(() => {
    if (!isActive) {
      webglRef.current?.();
      webglRef.current = null;
      return;
    }
    const id = requestAnimationFrame(() => {
      ensureWebgl();
      try {
        fitRef.current?.fit();
      } catch {
        // Not laid out yet; the ResizeObserver will catch up.
      }
      // The terminal opens lazily on its first visible fit (see the mount
      // effect), so it may not be attached yet — that first fit also focuses.
      //
      // Beyond autoFocus: if the user was typing in ANOTHER pane's terminal
      // when this one became active (mobile: card tap while the keyboard is
      // up), steal the focus. Moving focus input-to-input keeps the iOS
      // keyboard open, where blur-then-nothing would dismiss it.
      const active = document.activeElement;
      const typingInOtherTerminal =
        isTypingInTerminal(active) && !hostRef.current?.contains(active);
      if ((autoFocus || typingInOtherTerminal) && termRef.current?.element) {
        termRef.current.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isActive, autoFocus]);

  return (
    // touch-none: no native pan may ever start on the terminal — with the iOS
    // keyboard up a vertical drag pans the whole page (overflow:hidden does
    // not apply to viewport panning), and once Safari claims the gesture the
    // touchmove preventDefault (touchGesture.ts) arrives too late. All touch
    // scrolling here is synthesized into wheel events instead.
    <div className="relative w-full h-full" style={{ display: isActive ? '' : 'none' }}>
      <div
        ref={hostRef}
        className="relative overflow-hidden w-full h-full touch-none"
        style={
          {
            // Consumed by the `.xterm, .xterm *` rule in index.css to beat the
            // global `* { font-pixel }` base rule. Fed from the same constant
            // xterm measures its cell grid with, so CSS can't drift from metrics.
            '--font-terminal': TERMINAL_FONT_FAMILY,
            // The scrollbar thumb is drawn from the scheme's text colour, so it
            // shows on light and dark schemes alike (index.css).
            '--terminal-fg': scheme.theme.foreground,
          } as CSSProperties
        }
      />
      <InputDroppedNotice at={droppedAt} onDone={clearDropped} />
    </div>
  );
}
