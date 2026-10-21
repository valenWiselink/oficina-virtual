import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pasteText } from '../src/terminal/pasteText.js';

/**
 * What reaches an agent's PTY while its terminal socket comes and goes
 * (terminalClient.ts): keys typed by hand never wait (sent late they could
 * answer a permission or another question), whole messages (sendToAgent) wait
 * up to 30 s and go as their paste, then Enter.
 */

/** A stand-in for the browser's WebSocket: the test opens, speaks and closes it. */
class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Array<{ type: string; data?: string }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { type: string; data?: string });
  }
  close(): void {
    this.readyState = 3;
  }
  /** The server kept it: open, then the replay that starts every attach. */
  attach(): void {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: 'replay', data: '', cols: 80, rows: 24 }) });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
  /** What went to the PTY as input. */
  inputs(): string[] {
    return this.sent.filter((f) => f.type === 'input').map((f) => f.data ?? '');
  }
}

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'oficina', search: '?token=t' } });
vi.stubGlobal('WebSocket', FakeSocket);
// After the stubs: serverToken.ts reads the page's address when it loads.
const { TerminalConnection } = await import('../src/terminal/terminalClient.js');
const { INPUT_HOLD_MS } = await import('../src/terminal/heldInput.js');

function connection() {
  const dropped = vi.fn();
  const conn = new TerminalConnection(7, {
    onOutput: () => {},
    onReplay: () => {},
    onExit: () => {},
    onStatusChange: () => {},
    onInputDropped: dropped,
  });
  void conn.connect();
  const socket = () => FakeSocket.all[FakeSocket.all.length - 1];
  return { conn, dropped, socket };
}

/** Drop the socket and let the reconnect open a new one (not attached yet). */
function reconnecting(socket: () => FakeSocket) {
  socket().drop();
  vi.runOnlyPendingTimers();
}

describe('what a terminal sends while it reconnects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
  });
  afterEach(() => vi.useRealTimers());

  it('sends typed keys right away while attached', () => {
    const { conn, socket } = connection();
    socket().attach();
    conn.write('y');
    expect(socket().inputs()).toEqual(['y']);
  });

  it('drops keys typed while detached, says so once, and never sends them later', () => {
    const { conn, dropped, socket } = connection();
    socket().attach();
    reconnecting(socket);
    conn.write('1');
    conn.write('\r');
    conn.write('\x1b[B');
    expect(dropped).toHaveBeenCalledOnce();
    socket().attach();
    expect(socket().inputs()).toEqual([]);
    // Said again after the reattach: its replay wiped the first notice.
    expect(dropped).toHaveBeenCalledTimes(2);
    // Attached again: typing goes, and a later drop is told again.
    conn.write('a');
    expect(socket().inputs()).toEqual(['a']);
    reconnecting(socket);
    conn.write('b');
    expect(dropped).toHaveBeenCalledTimes(3);
  });

  it('holds a whole message and sends it as its paste, then Enter, once back', () => {
    const { conn, dropped, socket } = connection();
    socket().attach();
    reconnecting(socket);
    const done = vi.fn();
    conn.sendMessage(() => pasteText('Dale, seguí', true), done);
    conn.sendMessage(() => 'Hacé el PR', done);
    vi.advanceTimersByTime(INPUT_HOLD_MS - 1_000);
    socket().attach();
    expect(socket().inputs()).toEqual(['\x1b[200~Dale, seguí\x1b[201~']);
    vi.advanceTimersByTime(150);
    expect(socket().inputs()).toEqual(['\x1b[200~Dale, seguí\x1b[201~', '\r', 'Hacé el PR']);
    vi.advanceTimersByTime(150);
    expect(socket().inputs()).toEqual(['\x1b[200~Dale, seguí\x1b[201~', '\r', 'Hacé el PR', '\r']);
    expect(done.mock.calls).toEqual([[true], [true]]);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('drops a held message when the terminal stays away 30 s, and says so', () => {
    const { conn, dropped, socket } = connection();
    socket().attach();
    socket().drop();
    const done = vi.fn();
    conn.sendMessage(() => 'Esperá', done);
    vi.advanceTimersByTime(INPUT_HOLD_MS);
    expect(done).toHaveBeenCalledWith(false);
    expect(dropped).toHaveBeenCalledOnce();
    vi.runOnlyPendingTimers();
    socket().attach();
    expect(socket().inputs()).toEqual([]);
    expect(dropped).toHaveBeenCalledTimes(2); // again over the replay
  });

  it('fails a message at once when the server refused the page (another run)', () => {
    const { conn, socket } = connection();
    socket().drop(4005);
    const done = vi.fn();
    conn.sendMessage(() => 'Dale', done);
    expect(done).toHaveBeenCalledWith(false);
  });
});

describe('a message pasted into a terminal', () => {
  it('keeps its lines inside the bracketed-paste markers', () => {
    expect(pasteText('uno\ndos\r\ntres', true)).toBe('\x1b[200~uno\rdos\rtres\x1b[201~');
    expect(pasteText('uno\ndos', false)).toBe('uno\rdos');
  });
});
