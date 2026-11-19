import { describe, expect, it } from 'vitest';

import type { PendingAskEntry } from '../../core/src/messages.js';
import { AUTO_UNDO_MS, recentAutoClosed } from '../src/pendingAsks/pendingAsksView.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const closed = (id: string, agoMin: number, autoClosed = true): PendingAskEntry => ({
  id,
  from: 'Jarvis',
  text: id,
  at: NOW - 60 * MIN,
  closedAt: NOW - agoMin * MIN,
  closedHow: 'Le contestaste a Jarvis: «listo»',
  ...(autoClosed ? { autoClosed: true } : {}),
});

describe('«Se cerraron solos»', () => {
  it('shows the ones the office closed lately, newest first, with at most three', () => {
    const list = [
      closed('p1', 5),
      closed('p2', 1),
      closed('p3', 30, false),
      closed('p4', AUTO_UNDO_MS / MIN + 1),
      closed('p5', 10),
      closed('p6', 20),
    ];
    expect(recentAutoClosed(list, NOW).map((a) => a.id)).toEqual(['p2', 'p1', 'p5']);
  });

  it('shows nothing when the office closed nothing by itself', () => {
    expect(recentAutoClosed([closed('p1', 1, false)], NOW)).toEqual([]);
  });
});
