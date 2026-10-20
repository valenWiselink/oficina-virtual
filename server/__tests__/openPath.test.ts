import { describe, expect, it } from 'vitest';

import { explorerArgs, openInExplorer } from '../src/openPath.js';

describe('openPath', () => {
  it('quotes the path for explorer: a folder as is, a file selected', () => {
    expect(explorerArgs('F:\\a b\\c', true)).toEqual(['"F:\\a b\\c"']);
    expect(explorerArgs('F:\\a b\\c.txt', false)).toEqual(['/select,"F:\\a b\\c.txt"']);
  });

  it('refuses anything that is not an existing drive path', () => {
    expect(openInExplorer('src\\x')).toBe(false);
    expect(openInExplorer('\\\\server\\share\\x')).toBe(false);
    expect(openInExplorer('C:\\no\\existe\\de\\verdad.txt')).toBe(false);
    expect(openInExplorer(42)).toBe(false);
  });
});
