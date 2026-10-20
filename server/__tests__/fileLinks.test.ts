import { describe, expect, it } from 'vitest';

import { FileLinkTracker, fileOpOf } from '../src/fileLinks.js';

describe('fileOpOf', () => {
  it('reads Read and the write family, ignores the rest', () => {
    expect(fileOpOf('Read', { file_path: 'F:\\a.md' })).toEqual({ op: 'read', path: 'F:\\a.md' });
    expect(fileOpOf('Edit', { file_path: 'F:\\a.md' })?.op).toBe('write');
    expect(fileOpOf('NotebookEdit', { notebook_path: 'F:\\n.ipynb' })?.op).toBe('write');
    expect(fileOpOf('Bash', { command: 'cat a.md' })).toBeNull();
    expect(fileOpOf('Read', {})).toBeNull();
  });
});

describe('FileLinkTracker', () => {
  it('reports a sibling reading what another wrote', () => {
    const t = new FileLinkTracker();
    expect(t.observe(1, 'cto', { op: 'write', path: 'F:\\junta\\cto.md' })).toBeNull();
    expect(t.observe(1, 'revisor', { op: 'read', path: 'F:\\JUNTA\\cto.md' })).toEqual({
      leadId: 1,
      fromParentToolId: 'cto',
      toParentToolId: 'revisor',
      fileName: 'cto.md',
    });
  });

  it('ignores own files, files nobody wrote, and other leads', () => {
    const t = new FileLinkTracker();
    t.observe(1, 'cto', { op: 'write', path: 'F:\\x.md' });
    expect(t.observe(1, 'cto', { op: 'read', path: 'F:\\x.md' })).toBeNull();
    expect(t.observe(1, 'b', { op: 'read', path: 'F:\\nadie.md' })).toBeNull();
    expect(t.observe(2, 'b', { op: 'read', path: 'F:\\x.md' })).toBeNull();
  });

  it('forgets a lead whose session ended', () => {
    const t = new FileLinkTracker();
    t.observe(1, 'cto', { op: 'write', path: 'F:\\x.md' });
    t.forgetLead(1);
    expect(t.observe(1, 'b', { op: 'read', path: 'F:\\x.md' })).toBeNull();
  });
});
