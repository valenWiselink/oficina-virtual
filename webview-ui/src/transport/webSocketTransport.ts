import {
  TRANSPORT_STATE_CONNECTED,
  TRANSPORT_STATE_CONNECTING,
  TRANSPORT_STATE_DISCONNECTED,
  TRANSPORT_STATE_RECONNECTING,
} from '../../../core/src/constants.js';
import type { ClientMessage, ServerMessage } from '../../../core/src/messages.js';
import { reconnectDelayMs } from './reconnectBackoff.js';
import { type HeldMessage, mayHold, stillWorthSending } from './sendQueue.js';
import { meetServerRun } from './serverBoot.js';
import type { MessageTransport, TransportState } from './types.js';

/** WebSocket.OPEN, spelled out so a test's stand-in socket needs no global. */
const SOCKET_OPEN = 1;

/** How long an opened connection waits for the server to say which run it is
 *  before taking it for an older server that never says (and sending). */
const HELLO_WAIT_MS = 1_500;

export interface WebSocketTransportOptions {
  /** The server restarted under this page: every agent id it holds is stale.
   *  Reloads the page by default. */
  onServerRestart?: () => void;
  /** Tests: a stand-in for the browser's WebSocket. */
  createSocket?: (url: string) => WebSocket;
}

/**
 * WebSocket transport for standalone browser mode.
 * Connects to the Pixel Agents server via WebSocket for bidirectional messaging.
 * Includes automatic reconnection with exponential backoff, and holds what is
 * sent while disconnected — briefly, and never a change aimed at an agent by
 * its id (sendQueue.ts) — until the server says it is the same run.
 */
export class WebSocketTransport implements MessageTransport {
  private ws: WebSocket | null = null;
  private handlers: Array<(msg: ServerMessage) => void> = [];
  private stateHandlers: Array<(state: TransportState) => void> = [];
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private held: HeldMessage[] = [];
  /** This connection said which run it is (or was taken for an older server):
   *  until then everything waits, so nothing reaches a restarted server. */
  private greeted = false;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  /** The server restarted: this page is going away, it sends and hears nothing. */
  private stale = false;
  private _state: TransportState = TRANSPORT_STATE_CONNECTING;
  private readonly _ready: Promise<void>;
  private resolveReady!: () => void;
  private readonly onServerRestart: () => void;
  private readonly createSocket: (url: string) => WebSocket;

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url;
    this.onServerRestart = options.onServerRestart ?? (() => window.location.reload());
    this.createSocket = options.createSocket ?? ((u) => new WebSocket(u));
    this._ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  get state(): TransportState {
    return this._state;
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  private setState(next: TransportState): void {
    if (this._state === next) return;
    this._state = next;
    for (const handler of this.stateHandlers) handler(next);
  }

  connect(): void {
    if (this.disposed) return;

    // First attempt is "connecting"; any retry after a drop is "reconnecting".
    this.setState(
      this.reconnectAttempts > 0 ? TRANSPORT_STATE_RECONNECTING : TRANSPORT_STATE_CONNECTING,
    );

    const ws = this.createSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      console.log('[Transport] WebSocket connected');
      this.setState(TRANSPORT_STATE_CONNECTED);
      this.resolveReady();
      // What waited goes once the server says which run it is (serverHello,
      // its first message); an older server never says, so not forever.
      this.helloTimer = setTimeout(() => this.greet(), HELLO_WAIT_MS);
    };

    ws.onmessage = (e: MessageEvent) => {
      if (this.stale) return;
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        if (msg.type === 'serverHello' && !this.onHello(msg.bootId)) return;
        for (const handler of this.handlers) handler(msg);
      } catch {
        // Malformed JSON, ignore
      }
    };

    ws.onclose = () => {
      this.greeted = false;
      this.clearHelloTimer();
      if (!this.disposed) {
        this.setState(TRANSPORT_STATE_RECONNECTING);
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }

  /** The server said which run it is. Another run than this page's means its
   *  agent ids now name other agents: drop what waited and reload. */
  private onHello(bootId: string): boolean {
    if (meetServerRun(bootId) === 'restarted') {
      this.stale = true;
      this.held = [];
      this.clearHelloTimer();
      console.log('[Transport] The office restarted: reloading this page');
      this.onServerRestart();
      return false;
    }
    this.greet();
    return true;
  }

  /** Same run (or an older server): send what is still worth sending. */
  private greet(): void {
    this.clearHelloTimer();
    const ws = this.ws;
    if (this.greeted || this.stale || ws?.readyState !== SOCKET_OPEN) return;
    this.greeted = true;
    const now = Date.now();
    for (const held of this.held) {
      if (stillWorthSending(held, now)) ws.send(JSON.stringify(held.message));
      else console.warn(`[Transport] Not sent, too late: ${held.message.type}`);
    }
    this.held = [];
  }

  private clearHelloTimer(): void {
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.helloTimer = null;
  }

  send(message: ClientMessage): void {
    if (this.stale) return;
    if (this.greeted && this.ws?.readyState === SOCKET_OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (mayHold(message)) {
      this.held.push({ message, at: Date.now() });
    } else {
      console.warn(`[Transport] Not connected, not sent: ${message.type}`);
    }
  }

  onMessage(handler: (message: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Deliver an externally-sourced message to all handlers, as if it had arrived
   * over the socket. Used in Vite dev mode to bridge `browserMock`'s injected
   * `window` messages (there is no real server to connect to in dev).
   */
  deliver(message: ServerMessage): void {
    for (const handler of this.handlers) handler(message);
  }

  onStateChange(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearHelloTimer();
    this.ws?.close();
    this.ws = null;
    this.handlers = [];
    this.held = [];
    this.setState(TRANSPORT_STATE_DISCONNECTED);
    this.stateHandlers = [];
  }

  private scheduleReconnect(): void {
    const delay = reconnectDelayMs(this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `[Transport] WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
