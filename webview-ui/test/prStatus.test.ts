import { describe, expect, it } from 'vitest';

import type { PrStatus } from '../../core/src/messages.js';
import { applyPrMessage } from '../src/prs/prStatus.js';

const URL = 'https://github.com/acme/web/pull/7';

describe('applyPrMessage', () => {
  it('takes the handshake set as history, not news', () => {
    const r = applyPrMessage(new Map(), {
      type: 'prStatuses',
      items: [{ url: URL, state: 'merged' }],
    });
    expect(r?.next.get(URL)?.state).toBe('merged');
    expect(r?.merged).toEqual([]);
  });

  it('reports a live change to merged once', () => {
    const open = new Map<string, PrStatus>([[URL, { url: URL, state: 'open' }]]);
    const r = applyPrMessage(open, { type: 'prStatus', url: URL, state: 'merged', title: 'Fix' });
    expect(r?.merged).toEqual([URL]);
    expect(r?.next.get(URL)).toEqual({ url: URL, state: 'merged', title: 'Fix' });
    const again = applyPrMessage(r!.next, { type: 'prStatus', url: URL, state: 'merged' });
    expect(again?.merged).toEqual([]);
  });

  it('ignores other messages', () => {
    expect(applyPrMessage(new Map(), { type: 'dayLog' })).toBeNull();
  });
});
