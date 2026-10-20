import { describe, expect, it } from 'vitest';

import {
  createResearchTracker,
  RESEARCH_LINGER_MS,
  RESEARCH_STREAK,
} from '../src/office/behaviors/researchTracker.js';

function tracker() {
  let now = 1000;
  const t = createResearchTracker(() => now);
  return { t, advance: (ms: number) => (now += ms), now: () => now };
}

describe('research tracker', () => {
  it('a single Read before an edit is not research', () => {
    const { t, now } = tracker();
    t.toolStarted(1, 'Read', 'Reading a.ts');
    t.toolStarted(1, 'Edit', 'Editing a.ts');
    expect(t.isResearching(1, now())).toBe(false);
  });

  it(`a streak of ${RESEARCH_STREAK} reads/searches is research`, () => {
    const { t, now } = tracker();
    t.toolStarted(1, 'Grep', 'Searching code');
    t.toolStarted(1, 'Read', 'Reading a.ts');
    expect(t.isResearching(1, now())).toBe(false);
    t.toolStarted(1, 'Glob', 'Searching files');
    expect(t.isResearching(1, now())).toBe(true);
  });

  it('any web search is research at once, also from a subagent status line', () => {
    const { t, now } = tracker();
    t.toolStarted(-5, undefined, 'Searching the web');
    expect(t.isResearching(-5, now())).toBe(true);
  });

  it('lingers briefly, and stops on an edit or the end of the turn', () => {
    const { t, advance, now } = tracker();
    t.toolStarted(1, 'WebSearch', 'Searching the web');
    advance(RESEARCH_LINGER_MS - 1);
    expect(t.isResearching(1, now())).toBe(true);
    advance(2);
    expect(t.isResearching(1, now())).toBe(false);

    t.toolStarted(2, 'WebFetch', 'Fetching web content');
    t.toolStarted(2, 'Bash', 'Running: go test');
    expect(t.isResearching(2, now())).toBe(false);

    t.toolStarted(3, 'WebFetch', 'Fetching web content');
    t.stop(3);
    expect(t.isResearching(3, now())).toBe(false);
  });
});
