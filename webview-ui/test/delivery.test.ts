import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientMessage } from '../../core/src/messages.js';
import { pendingNote } from '../src/chat/chatText.js';
import { HeldInput, INPUT_HOLD_MS } from '../src/terminal/heldInput.js';
import { HELD_MAX_AGE_MS, mayHold, stillWorthSending } from '../src/transport/sendQueue.js';
import { knownServerRun, resetServerRunForTests } from '../src/transport/serverBoot.js';
import { WebSocketTransport } from '../src/transport/webSocketTransport.js';

/** A stand-in for the browser's WebSocket: the test opens, speaks and closes it. */
class FakeSocket {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  hear(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const restarts = vi.fn();
  const transport = new WebSocketTransport('ws://x/ws', {
    onServerRestart: restarts,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  });
  const heard: string[] = [];
  transport.onMessage((m) => heard.push(m.type));
  transport.connect();
  return { transport, sockets, restarts, heard, last: () => sockets[sockets.length - 1] };
}

describe('what the page may send late', () => {
  it('never holds a change aimed at an agent by its number', () => {
    for (const type of ['closeAgent', 'editAgent', 'setAgentRun', 'setSupervision']) {
      expect(mayHold({ type, id: 3 } as unknown as ClientMessage)).toBe(false);
    }
    expect(mayHold({ type: 'requestAgentChat', id: 3 })).toBe(true);
    expect(mayHold({ type: 'webviewReady' })).toBe(true);
  });

  it('keeps the rest only a few seconds, but always asks for the state again', () => {
    const at = 1_000_000;
    const chat = { message: { type: 'requestAgentChat', id: 1 } as ClientMessage, at };
    expect(stillWorthSending(chat, at + HELD_MAX_AGE_MS)).toBe(true);
    expect(stillWorthSending(chat, at + HELD_MAX_AGE_MS + 1)).toBe(false);
    const ready = { message: { type: 'webviewReady' } as ClientMessage, at };
    expect(stillWorthSending(ready, at + 60_000)).toBe(true);
  });
});

describe('the office transport and server restarts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetServerRunForTests();
  });
  afterEach(() => vi.useRealTimers());

  it('sends what waited once the server says which run it is', () => {
    const h = harness();
    h.transport.send({ type: 'webviewReady' });
    h.last().open();
    expect(h.last().sent).toEqual([]); // not before the hello
    h.last().hear({ type: 'serverHello', bootId: 'run-1' });
    expect(h.last().sent).toEqual([{ type: 'webviewReady' }]);
    expect(knownServerRun()).toBe('run-1');
    h.transport.send({ type: 'requestAgentChat', id: 2 });
    expect(h.last().sent).toHaveLength(2);
  });

  it('reloads instead of handing a held "close agent 5" to whoever is 5 now', () => {
    const h = harness();
    h.last().open();
    h.last().hear({ type: 'serverHello', bootId: 'run-1' });
    h.last().drop();
    h.transport.send({ type: 'closeAgent', id: 5 }); // refused outright
    h.transport.send({ type: 'requestAgentChat', id: 5 }); // held
    vi.advanceTimersByTime(2_000);
    h.last().open();
    h.last().hear({ type: 'serverHello', bootId: 'run-2' });
    h.last().hear({ type: 'agentCreated', id: 5 });
    expect(h.restarts).toHaveBeenCalledOnce();
    expect(h.last().sent).toEqual([]);
    // Only the first run's hello: the new run's agents never reach this page.
    expect(h.heard).toEqual(['serverHello']);
    h.transport.send({ type: 'requestAgentChat', id: 5 });
    expect(h.last().sent).toEqual([]);
  });

  it('after a blip on the same run, sends only what is still fresh', () => {
    const h = harness();
    h.last().open();
    h.last().hear({ type: 'serverHello', bootId: 'run-1' });
    h.last().drop();
    h.transport.send({ type: 'requestAgentChat', id: 1 });
    vi.advanceTimersByTime(HELD_MAX_AGE_MS + 1);
    h.transport.send({ type: 'requestAgentChat', id: 2 });
    vi.advanceTimersByTime(10_000);
    h.last().open();
    h.last().hear({ type: 'serverHello', bootId: 'run-1' });
    expect(h.restarts).not.toHaveBeenCalled();
    expect(h.last().sent).toEqual([]); // both are older than the hold by now
  });

  it('still talks to an older server that never says hello', () => {
    const h = harness();
    h.transport.send({ type: 'webviewReady' });
    h.last().open();
    vi.advanceTimersByTime(1_500);
    expect(h.last().sent).toEqual([{ type: 'webviewReady' }]);
  });
});

describe('input written while a terminal reconnects', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes out whole and in order when it attaches again', () => {
    const written: string[] = [];
    const results: boolean[] = [];
    const held = new HeldInput(() => results.push(false));
    held.hold('Dale, seguí');
    held.hold('\r', (sent) => results.push(sent));
    vi.advanceTimersByTime(INPUT_HOLD_MS - 1);
    held.release((d) => written.push(d));
    expect(written).toEqual(['Dale, seguí', '\r']);
    expect(results).toEqual([true]);
  });

  it('is dropped whole and said when the terminal stays away', () => {
    const expired = vi.fn();
    const results: boolean[] = [];
    const held = new HeldInput(expired);
    held.hold('Hacé el PR', (sent) => results.push(sent));
    vi.advanceTimersByTime(INPUT_HOLD_MS);
    expect(results).toEqual([false]);
    expect(expired).toHaveBeenCalledOnce();
    const written: string[] = [];
    held.release((d) => written.push(d));
    expect(written).toEqual([]);
  });
});

describe('what the chat says under a message you sent', () => {
  it('is honest about where it is', () => {
    expect(pendingNote('sending', false, false)).toBe('Enviando…');
    expect(pendingNote('failed', true, true)).toMatch(/^No le llegó/);
    // A busy agent reads it when its turn ends, however long that takes.
    expect(pendingNote('sent', true, true)).toMatch(/^En cola/);
    expect(pendingNote('sent', false, false)).toBe('Enviando…');
    expect(pendingNote('sent', false, true)).toMatch(/fijate en la terminal/);
  });
});
