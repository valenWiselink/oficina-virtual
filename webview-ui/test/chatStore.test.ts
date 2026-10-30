/// <reference types="vite/client" />

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatItem } from '../../core/src/messages.js';

type Listener = (msg: Record<string, unknown>) => void;
const listeners = vi.hoisted(() => [] as Array<(msg: Record<string, unknown>) => void>);

vi.mock('../src/transport/index.js', () => ({
  transport: {
    onMessage: (l: Listener) => listeners.push(l),
    onStateChange: () => () => undefined,
    send: () => undefined,
  },
}));

const { addPending, pendingMessages, settleDelivery } = await import('../src/chat/chatStore.js');
const { withChatHint } = await import('../src/chat/chatText.js');

const deliver = (msg: Record<string, unknown>) => listeners.forEach((l) => l(msg));
const you = (id: string, text: string, at: number): ChatItem => ({
  id,
  role: 'user',
  text: withChatHint(text),
  at,
});
const texts = (agent: number) => pendingMessages(agent).map((p) => p.text);

let agent = 100;
beforeEach(() => {
  agent += 1; // the store is module-wide: each test talks to its own agent
  vi.useRealTimers();
});

describe('the chat store settles what you sent against the conversation', () => {
  it('a message read before a newer one never stays «En cola» under it (2026-10-30)', () => {
    // Jarvis was free: «apruebo el plan de caja» was read at once and its
    // line came before the chat could pair it; then «algo que requiera mi
    // atencion?» went and was read too. The first one stayed at the bottom,
    // «En cola», under the newer one.
    deliver({ type: 'agentChat', id: agent, items: [you('u0', 'el pase de candado', 1)] });
    deliver({
      type: 'agentChatAppend',
      id: agent,
      items: [you('u1', 'apruebo el plan de caja', 2)],
    });
    settleDelivery(agent, addPending(agent, 'apruebo el plan de caja'), true);
    expect(texts(agent)).toEqual(['apruebo el plan de caja']);

    const later = addPending(agent, 'algo que requiera mi atencion?');
    settleDelivery(agent, later, true);
    deliver({
      type: 'agentChatAppend',
      id: agent,
      items: [you('u2', 'algo que requiera mi atencion?', Date.now() + 1)],
    });
    expect(texts(agent)).toEqual([]);
  });

  it('pairs a line that came before the terminal said it got the message', () => {
    deliver({ type: 'agentChat', id: agent, items: [] });
    const key = addPending(agent, 'apruebo el plan de caja');
    deliver({
      type: 'agentChatAppend',
      id: agent,
      items: [you('u1', 'apruebo el plan de caja', Date.now())],
    });
    settleDelivery(agent, key, true);
    expect(texts(agent)).toEqual([]);
  });

  it('pairs a line that only comes in a reload of the conversation', () => {
    deliver({ type: 'agentChat', id: agent, items: [] });
    settleDelivery(agent, addPending(agent, 'listo'), true);
    deliver({ type: 'agentChat', id: agent, items: [you('u1', 'listo', Date.now())] });
    expect(texts(agent)).toEqual([]);
  });

  it('an older line with the same text is not the message just sent', () => {
    deliver({ type: 'agentChat', id: agent, items: [you('u0', 'sí', 1)] });
    settleDelivery(agent, addPending(agent, 'sí'), true);
    deliver({
      type: 'agentChatAppend',
      id: agent,
      items: [{ id: 'a1', role: 'assistant', text: 'ok', at: 2 }],
    });
    expect(texts(agent)).toEqual(['sí']);
    deliver({ type: 'agentChatAppend', id: agent, items: [you('u1', 'sí', Date.now())] });
    expect(texts(agent)).toEqual([]);
  });

  it('two messages with the same text need a line each', () => {
    deliver({ type: 'agentChat', id: agent, items: [] });
    settleDelivery(agent, addPending(agent, 'dale'), true);
    settleDelivery(agent, addPending(agent, 'dale'), true);
    deliver({ type: 'agentChatAppend', id: agent, items: [you('u1', 'dale', Date.now())] });
    // A reload brings the same line again: it settled one already.
    deliver({ type: 'agentChat', id: agent, items: [you('u1', 'dale', Date.now())] });
    expect(texts(agent)).toEqual(['dale']);
  });

  it('a message still on its way is not dropped for a newer one', () => {
    deliver({ type: 'agentChat', id: agent, items: [] });
    addPending(agent, 'primero'); // its terminal has not answered yet
    settleDelivery(agent, addPending(agent, 'segundo'), true);
    deliver({ type: 'agentChatAppend', id: agent, items: [you('u1', 'segundo', Date.now())] });
    expect(texts(agent)).toEqual(['primero']);
  });
});
