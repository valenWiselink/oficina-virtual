import { describe, expect, it } from 'vitest';

import { endedWaiting } from '../src/resumeState.js';

const rec = (r: object) => JSON.stringify(r);
const answer = (content: object[]) => rec({ type: 'assistant', message: { content } });

describe('endedWaiting', () => {
  it('sees a finished turn: turn_duration, or an answer with no tool pending', () => {
    expect(
      endedWaiting([answer([{ type: 'text' }]), rec({ type: 'system', subtype: 'turn_duration' })]),
    ).toBe(true);
    expect(
      endedWaiting([
        rec({ type: 'user', message: { content: 'hola' } }),
        answer([{ type: 'text' }]),
      ]),
    ).toBe(true);
  });

  it('sees a turn still going: a tool call pending or your message last', () => {
    expect(endedWaiting([answer([{ type: 'text' }, { type: 'tool_use' }])])).toBe(false);
    expect(
      endedWaiting([
        answer([{ type: 'text' }]),
        rec({ type: 'user', message: { content: 'seguí' } }),
      ]),
    ).toBe(false);
  });

  it('skips titles, snapshots, sidechains and cut lines', () => {
    const lines = [
      answer([{ type: 'text' }]),
      rec({ type: 'ai-title', aiTitle: 'x' }),
      rec({ type: 'user', isSidechain: true, message: { content: 'sub' } }),
      rec({ type: 'file-history-snapshot' }),
      '"cortada}',
    ];
    expect(endedWaiting(lines)).toBe(true);
    expect(endedWaiting([])).toBe(false);
  });

  it('an idle compaction does not reopen a finished turn', () => {
    expect(
      endedWaiting([
        answer([{ type: 'text' }]),
        rec({ type: 'system', subtype: 'compact_boundary' }),
        rec({ type: 'user', isCompactSummary: true, message: { content: 'This session…' } }),
        rec({ type: 'attachment' }),
        rec({ type: 'system', subtype: 'informational' }),
      ]),
    ).toBe(true);
  });
});

describe('endedWaiting after Esc', () => {
  it('a stopped turn is over', () => {
    expect(
      endedWaiting([
        answer([{ type: 'tool_use' }]),
        rec({
          type: 'user',
          message: {
            content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }],
          },
        }),
      ]),
    ).toBe(true);
  });
});
