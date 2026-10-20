import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { explorerArgs, openInExplorer, openMode, resolveLocalPath } from '../src/openPath.js';

describe('resolveLocalPath', () => {
  it("finds a relative path in the agent's folder or one of its repos", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'abrir-'));
    try {
      fs.mkdirSync(path.join(cwd, 'wiselink_api_metrics', 'migrations'), { recursive: true });
      const sql = path.join(cwd, 'wiselink_api_metrics', 'migrations', 'a.sql');
      fs.writeFileSync(sql, '');
      fs.writeFileSync(path.join(cwd, 'README.md'), '');
      expect(resolveLocalPath('migrations/a.sql', cwd)).toBe(sql);
      expect(resolveLocalPath('./README.md', cwd)).toBe(path.join(cwd, 'README.md'));
      expect(resolveLocalPath('migrations/nada.sql', cwd)).toBe('migrations/nada.sql');
      expect(resolveLocalPath('../afuera.sql', cwd)).toBe('../afuera.sql');
      expect(resolveLocalPath('migrations/a.sql', undefined)).toBe('migrations/a.sql');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('openPath', () => {
  it('quotes the path for explorer: a folder or document as is, a file selected', () => {
    expect(explorerArgs('F:\\a b\\c', 'folder')).toEqual(['"F:\\a b\\c"']);
    expect(explorerArgs('F:\\a b\\c.sql', 'open')).toEqual(['"F:\\a b\\c.sql"']);
    expect(explorerArgs('F:\\a b\\c.exe', 'select')).toEqual(['/select,"F:\\a b\\c.exe"']);
  });

  it('opens documents, and only shows anything that could run', () => {
    expect(openMode('F:\\r\\migrations\\a.SQL', false)).toBe('open');
    expect(openMode('F:\\r\\informe.pdf', false)).toBe('open');
    expect(openMode('F:\\r\\src', true)).toBe('folder');
    for (const risky of [
      'x.bat',
      'x.cmd',
      'x.ps1',
      'x.js',
      'x.exe',
      'x.lnk',
      'x.url',
      'x.hta',
      'x',
    ]) {
      expect(openMode(`F:\\r\\${risky}`, false)).toBe('select');
    }
  });

  it('refuses anything that is not an existing drive path', () => {
    expect(openInExplorer('src\\x')).toBe(false);
    expect(openInExplorer('\\\\server\\share\\x')).toBe(false);
    expect(openInExplorer('C:\\no\\existe\\de\\verdad.txt')).toBe(false);
    expect(openInExplorer(42)).toBe(false);
  });
});
