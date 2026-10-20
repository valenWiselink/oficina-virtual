import { describe, expect, it } from 'vitest';

import { resolveWindowsCommand } from '../src/terminal/windowsCommand.js';

const env = {
  PATH: 'C:\\a;C:\\Users\\x\\.local\\bin;C:\\npm',
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe',
};

function existing(...files: string[]): (file: string) => boolean {
  const set = new Set(files.map((f) => f.toLowerCase()));
  return (file) => set.has(file.toLowerCase());
}

describe('resolveWindowsCommand', () => {
  it('finds the native claude.exe on PATH (node-pty does not search PATH)', () => {
    expect(
      resolveWindowsCommand(
        'claude',
        ['--session-id', 'x'],
        env,
        existing('C:\\Users\\x\\.local\\bin\\claude.exe'),
      ),
    ).toEqual({ command: 'C:\\Users\\x\\.local\\bin\\claude.exe', args: ['--session-id', 'x'] });
  });

  it('runs an npm batch shim through cmd.exe', () => {
    expect(
      resolveWindowsCommand('claude', ['--resume', 'x'], env, existing('C:\\npm\\claude.cmd')),
    ).toEqual({
      command: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: ['/d', '/s', '/c', 'C:\\npm\\claude.cmd', '--resume', 'x'],
    });
  });

  it('prefers the first PATH entry, like a shell', () => {
    const found = resolveWindowsCommand(
      'claude',
      [],
      env,
      existing('C:\\a\\claude.exe', 'C:\\npm\\claude.cmd'),
    );
    expect(found.command).toBe('C:\\a\\claude.exe');
  });

  it('leaves paths and unknown commands alone so the spawn error is the real one', () => {
    expect(resolveWindowsCommand('C:\\x\\claude.exe', [], env, existing())).toEqual({
      command: 'C:\\x\\claude.exe',
      args: [],
    });
    expect(resolveWindowsCommand('claude', [], env, existing())).toEqual({
      command: 'claude',
      args: [],
    });
  });
});
