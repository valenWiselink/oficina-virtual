/**
 * Terminal data-plane client: one WebSocket per attached agent terminal.
 *
 * Deliberately NOT part of the MessageTransport abstraction. That interface
 * carries the AsyncAPI control plane (`send(msg: ClientMessage)`), and it is a
 * single multiplexed connection shared by the whole app. Terminal I/O is a
 * per-agent raw byte stream on its own socket, so forcing it through the same
 * seam would mean widening the protocol union with a message no other client can
 * use. See docs/design/standalone-terminal.md.
 */

import { TERMINAL_WS_PREFIX } from '../../../core/src/constants.js';
import { parseServerFrame } from '../../../core/src/terminalFrames.js';
import { reconnectDelayMs } from '../transport/reconnectBackoff.js';
import { knownServerRun } from '../transport/serverBoot.js';
import { serverToken } from '../transport/serverToken.js';
import { HeldMessages, type WriteDone } from './heldInput.js';

export interface TerminalConnectionHandlers {
  onOutput(data: string): void;
  /** First frame of every (re)attach: a serialized snapshot of the server-side
   *  screen, laid out at cols×rows. Replace the terminal's content with it. */
  onReplay(data: string, cols: number, rows: number): void;
  onExit(exitCode: number): void;
  onStatusChange(status: TerminalConnectionStatus): void;
  /** What was written while it reconnected never went (keys typed by hand,
   *  or a message it did not come back in time for): say so where it was
   *  typed. */
  onInputDropped(): void;
}

/** Between a message's paste and its Enter, so the TUI takes the paste first —
 *  late enough for a background session, whose input travels through
 *  `claude attach` (the server's own sendToTerminal waits 80 ms). */
const MESSAGE_ENTER_AFTER_MS = 150;
/** Between the pastes of one message (an image's path, then the text):
 *  Claude Code reads a pasted image path into «[Image #1]» asynchronously
 *  («Pasting…»), and a paste that lands before it is done joins the path as
 *  plain text. Measured enough on 2026-10-28. */
const MESSAGE_PART_GAP_MS = 900;

/** A message as pastes: one, or several sent one after another (each
 *  image's path alone, then the text). Encoded at send time. */
export type MessagePastes = () => string | string[];

export type TerminalConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * A reconnecting terminal socket for one agent.
 *
 * The PTY outlives the socket server-side, so a reconnect replays the scrollback
 * ring and resumes -- dropping the connection never kills the user's session.
 */
export class TerminalConnection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private exited = false;
  /** Closed for good (no token, or the server refused it): writes fail now
   *  instead of waiting for a reconnect that will not come. */
  private refused = false;
  /** The server sent this socket's replay: input now reaches the PTY. */
  private attached = false;
  /** Something written while detached was dropped and that was said (once
   *  per drop; said again after the reattach, whose replay clears the screen). */
  private toldDropped = false;
  /** Last known geometry, re-sent on reconnect so a resize during a drop isn't lost. */
  private pending: { cols: number; rows: number } | null = null;

  // Declared as fields rather than constructor parameter properties:
  // `erasableSyntaxOnly` is on in the webview, and parameter properties emit
  // runtime code.
  private readonly agentId: number;
  private readonly handlers: TerminalConnectionHandlers;
  /** Whole messages sent while not attached: they go on the next replay. */
  private readonly held: HeldMessages<MessagePastes>;

  constructor(agentId: number, handlers: TerminalConnectionHandlers) {
    this.agentId = agentId;
    this.handlers = handlers;
    this.held = new HeldMessages(() => this.tellDropped());
  }

  async connect(): Promise<void> {
    if (this.disposed || this.exited) return;
    this.handlers.onStatusChange(this.attempt === 0 ? 'connecting' : 'reconnecting');

    // The token is the one this page was opened with (transport/serverToken.ts);
    // the server never hands it out over HTTP. A bare page was already told the
    // terminal is unavailable, so reaching here without one is a defensive stop,
    // not something a retry could fix.
    if (serverToken === null) {
      console.error(
        '[Webview] Terminal: this page has no server token (open the URL the CLI printed).',
      );
      this.refused = true;
      this.handlers.onStatusChange('closed');
      this.held.drop();
      return;
    }

    const socket = new WebSocket(this.url(serverToken));
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatusChange('connected');
      // Re-assert geometry: the fresh PTY-side socket doesn't know our size.
      if (this.pending) this.resize(this.pending.cols, this.pending.rows);
    };

    socket.onmessage = (event: MessageEvent) => {
      const frame = parseServerFrame(String(event.data));
      if (!frame) return;
      if (frame.type === 'output') {
        this.handlers.onOutput(frame.data);
      } else if (frame.type === 'replay') {
        this.handlers.onReplay(frame.data, frame.cols, frame.rows);
        // Only a socket the server kept gets a replay (it refuses a page from
        // a restarted run first): now what waited may go.
        this.attached = true;
        // The replay just wiped the notice written while away: say it again.
        if (this.toldDropped) this.handlers.onInputDropped();
        this.toldDropped = false;
        this.sendHeld();
      } else {
        this.exited = true;
        this.held.drop();
        this.handlers.onExit(frame.exitCode);
        this.handlers.onStatusChange('closed');
      }
    };

    socket.onclose = (event: CloseEvent) => {
      this.attached = false;
      if (this.disposed || this.exited) return;
      // An application close code (bad token, forbidden origin, no such
      // session, a page from a restarted run) is final: retrying can't fix
      // any of them, and hammering an auth-rejecting endpoint is pointless.
      if (event.code >= 4000 && event.code < 5000) {
        console.error(
          `[Webview] Terminal: agent ${String(this.agentId)} rejected (${String(event.code)}: ${event.reason})`,
        );
        this.refused = true;
        this.handlers.onStatusChange('closed');
        if (this.held.drop()) this.tellDropped();
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows; reconnection is handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.exited || this.reconnectTimer) return;
    this.handlers.onStatusChange('reconnecting');
    const delay = reconnectDelayMs(this.attempt);
    this.attempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** The socket url. The token rides the handshake query exactly as it does
   *  on /ws (the server's request log redacts it), so both sockets pass the
   *  same gate; the run this page belongs to lets a restarted server refuse
   *  ids that now name other agents. */
  private url(token: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const run = knownServerRun();
    return `${protocol}//${window.location.host}${TERMINAL_WS_PREFIX}/${String(
      this.agentId,
    )}?token=${encodeURIComponent(token)}${run ? `&boot=${encodeURIComponent(run)}` : ''}`;
  }

  private send(frame: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(frame));
    return true;
  }

  /**
   * Keys typed into the terminal. Not attached right now (reconnecting):
   * they are dropped, and the terminal says so once — sent late they could
   * answer whatever Claude asks by then (a permission, another question).
   */
  write(data: string): void {
    if (this.attached && this.send({ type: 'input', data })) return;
    if (!this.disposed) this.tellDropped();
  }

  private tellDropped(): void {
    if (this.toldDropped) return;
    this.toldDropped = true;
    this.handlers.onInputDropped();
  }

  /**
   * A whole message (sendToAgent): its paste, then Enter. While the terminal
   * reconnects it waits up to INPUT_HOLD_MS for the next attach; `done` says
   * whether it got there. `paste` is encoded at send time (bracketed or not,
   * as the app wants it then).
   */
  sendMessage(paste: MessagePastes, done: WriteDone): void {
    if (this.disposed || this.exited || this.refused) done(false);
    else if (this.attached) this.deliver(paste, done);
    else this.held.hold(paste, done);
  }

  private deliver(paste: MessagePastes, done: WriteDone): void {
    const parts = [paste()].flat();
    const next = (i: number) => {
      if (!this.send({ type: 'input', data: parts[i] })) {
        done(false);
        return;
      }
      if (i + 1 < parts.length) setTimeout(() => next(i + 1), MESSAGE_PART_GAP_MS);
      else setTimeout(() => done(this.send({ type: 'input', data: '\r' })), MESSAGE_ENTER_AFTER_MS);
    };
    next(0);
  }

  /** Back attached: the held messages go one after another, each with its
   *  own pause before Enter. */
  private sendHeld(): void {
    const queue = this.held.take();
    const next = () => {
      const held = queue.shift();
      if (!held) return;
      this.deliver(held.item, (sent) => {
        held.done(sent);
        next();
      });
    };
    next();
  }

  resize(cols: number, rows: number): void {
    this.pending = { cols, rows };
    this.send({ type: 'resize', cols, rows });
  }

  dispose(): void {
    this.disposed = true;
    this.held.drop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Detach handlers before closing: onclose would otherwise schedule a
    // reconnect for a connection we're deliberately tearing down.
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
  }
}
