import { describe, expect, it, vi } from 'vitest';

import type { ClientMessage, ServerMessage } from '../../core/src/messages.js';
import { EFFORT_CHOICES, makeAgentEdits, MODEL_CHOICES } from '../src/agents/agentEditRequests.js';

function fakeLink() {
  const sent: ClientMessage[] = [];
  const handlers = new Set<(m: ServerMessage) => void>();
  return {
    sent,
    handlers,
    deliver: (m: ServerMessage) => handlers.forEach((h) => h(m)),
    link: {
      send: (m: ClientMessage) => sent.push(m),
      onMessage: (h: (m: ServerMessage) => void) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    },
  };
}

describe('agent edits', () => {
  it('sends a rename and a recolour', () => {
    const f = fakeLink();
    makeAgentEdits(f.link).editAgent(3, { nickname: 'Pagos', palette: 2 });
    expect(f.sent).toEqual([{ type: 'editAgent', id: 3, nickname: 'Pagos', palette: 2 }]);
  });

  it('resolves setAgentRun with the answer for that agent only', async () => {
    const f = fakeLink();
    const answer = makeAgentEdits(f.link).setAgentRun(5, { model: 'opus', effort: null });
    expect(f.sent).toEqual([{ type: 'setAgentRun', id: 5, model: 'opus', effort: null }]);
    f.deliver({ type: 'agentRunResult', id: 4, ok: false, reason: 'otro' });
    f.deliver({ type: 'agentRunResult', id: 5, ok: true, newId: 9 });
    await expect(answer).resolves.toEqual({ ok: true, reason: undefined, newId: 9 });
    expect(f.handlers.size).toBe(0);
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const f = fakeLink();
    const answer = makeAgentEdits(f.link, 1000).setAgentRun(1, { model: null, effort: 'high' });
    vi.advanceTimersByTime(1000);
    await expect(answer).resolves.toEqual({ ok: false, reason: 'No respondió a tiempo' });
    expect(f.handlers.size).toBe(0);
    vi.useRealTimers();
  });

  it('labels every choice in Spanish, "Como siempre" first', () => {
    expect(MODEL_CHOICES.map((c) => c.label)).toEqual([
      'Como siempre',
      'Opus',
      'Sonnet',
      'Haiku',
      'Fable',
    ]);
    expect(EFFORT_CHOICES.map((c) => c.label)).toEqual([
      'Como siempre',
      'Bajo',
      'Medio',
      'Alto',
      'Muy alto',
      'Máximo',
    ]);
  });
});
