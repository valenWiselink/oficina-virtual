import { describe, expect, it } from 'vitest';

import {
  addFileLink,
  FILE_LINK_TTL_MS,
  filePassesOf,
  liveFileLinks,
} from '../src/office/behaviors/fileLinksStore.js';

describe('file passes between members', () => {
  it('the line fades after a while; each member keeps its passes, newest first', () => {
    addFileLink(-101, -102, 'notas.md', 1000);
    addFileLink(-103, -101, 'plan.md', 2000);
    expect(liveFileLinks(2000).some((l) => l.fromId === -101 && l.toId === -102)).toBe(true);
    expect(liveFileLinks(2000 + FILE_LINK_TTL_MS + 1).some((l) => l.fromId === -101)).toBe(false);
    expect(filePassesOf(-101).map((p) => p.file)).toEqual(['plan.md', 'notas.md']);
    expect(filePassesOf(-102)).toEqual([{ fromId: -101, toId: -102, file: 'notas.md', at: 1000 }]);
    expect(filePassesOf(-999)).toEqual([]);
  });
});
