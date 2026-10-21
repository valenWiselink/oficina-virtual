import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const {
  FOREIGN_STATUS_LINE_MESSAGE,
  STATUS_LINE_COMMAND,
  installStatusLine,
  isOurStatusLine,
  statusLineSetup,
  uninstallStatusLine,
  wrapperScript,
  writeStatusLineFiles,
} = await import('../src/usageLimits/statusLineInstaller.js');
const { UsageLimitsWatch } = await import('../src/usageLimits/usageLimitsWatch.js');

const settingsPath = () => path.join(tmpBase, '.claude', 'settings.json');
const readSettings = () => JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
function writeSettings(value: unknown): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(value, null, 2));
}

/** A package root with a built status line script. */
function fakePackage(): string {
  const root = path.join(tmpBase, 'pkg');
  fs.mkdirSync(path.join(root, 'dist', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'hooks', 'statusline.js'), '// script');
  return root;
}

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-test-'));
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('isOurStatusLine', () => {
  it('recognizes our wrapper however it is written', () => {
    expect(isOurStatusLine({ type: 'command', command: STATUS_LINE_COMMAND })).toBe(true);
    expect(
      isOurStatusLine({ command: '"C:\\Users\\Ana\\.Pixel-Agents\\hooks\\statusline.cmd"' }),
    ).toBe(true);
    expect(isOurStatusLine({ command: '/home/ana/.pixel-agents/hooks/statusline.sh' })).toBe(true);
  });

  it('never claims someone else’s', () => {
    expect(isOurStatusLine({ command: '~/.claude/statusline.sh' })).toBe(false);
    expect(isOurStatusLine({ command: '~/.pixel-agents/hooks/statusline.cmd.bak' })).toBe(false);
    expect(isOurStatusLine({ command: '~/evil.pixel-agents/hooks/statusline.cmd' })).toBe(false);
    expect(isOurStatusLine('~/.pixel-agents/hooks/statusline.cmd')).toBe(false);
    expect(isOurStatusLine(null)).toBe(false);
  });
});

describe('install / uninstall', () => {
  it('installs into a home with no settings and reports ours', async () => {
    expect(statusLineSetup()).toBe('off');
    await installStatusLine();
    expect(readSettings().statusLine).toEqual({
      type: 'command',
      command: STATUS_LINE_COMMAND,
      padding: 0,
    });
    expect(statusLineSetup()).toBe('ours');
  });

  it('keeps every other setting and is idempotent', async () => {
    writeSettings({ permissions: { allow: ['Bash(ls)'] }, model: 'opus' });
    await installStatusLine();
    await installStatusLine();
    const s = readSettings();
    expect(s.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(s.model).toBe('opus');
    expect(s.statusLine.command).toBe(STATUS_LINE_COMMAND);
  });

  it('refuses to replace the user’s own status line', async () => {
    const theirs = { type: 'command', command: '~/.claude/statusline.sh' };
    writeSettings({ statusLine: theirs });
    expect(statusLineSetup()).toBe('foreign');
    await expect(installStatusLine()).rejects.toThrow(FOREIGN_STATUS_LINE_MESSAGE);
    await uninstallStatusLine();
    expect(readSettings().statusLine).toEqual(theirs);
  });

  it('uninstall removes only ours', async () => {
    writeSettings({ model: 'opus' });
    await installStatusLine();
    await uninstallStatusLine();
    expect(readSettings()).toEqual({ model: 'opus' });
    expect(statusLineSetup()).toBe('off');
  });

  it('an unreadable settings.json is unknown and never rewritten', async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), '{ broken');
    expect(statusLineSetup()).toBe('unknown');
    await expect(installStatusLine()).rejects.toThrow();
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe('{ broken');
  });
});

describe('wrapperScript', () => {
  it('Windows: a .cmd that runs the exe as Node, with % escaped', () => {
    const text = wrapperScript('C:\\Apps\\Oficina virtual.exe', 'C:\\Users\\a%b\\s.js', 'win32');
    expect(text).toContain('set ELECTRON_RUN_AS_NODE=1\r\n');
    expect(text).toContain('"C:\\Apps\\Oficina virtual.exe" "C:\\Users\\a%%b\\s.js"');
    expect(text.startsWith('@echo off\r\n')).toBe(true);
  });

  it('elsewhere: a sh script with single quotes', () => {
    const text = wrapperScript('/usr/bin/node', "/home/o'neil/s.js", 'linux');
    expect(text).toBe(
      "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec '/usr/bin/node' '/home/o'\\''neil/s.js'\n",
    );
  });
});

describe('writeStatusLineFiles', () => {
  it('copies the script and writes the wrapper next to it', () => {
    expect(writeStatusLineFiles(fakePackage(), '/usr/bin/node')).toBe(true);
    const dir = path.join(tmpBase, '.pixel-agents', 'hooks');
    expect(fs.readFileSync(path.join(dir, 'statusline.js'), 'utf-8')).toBe('// script');
    const wrapper = fs.readdirSync(dir).find((f) => /^statusline\.(cmd|sh)$/.test(f));
    expect(wrapper).toBeDefined();
    expect(fs.readFileSync(path.join(dir, wrapper!), 'utf-8')).toContain('statusline.js');
  });

  it('is false when the build has no script', () => {
    expect(writeStatusLineFiles(path.join(tmpBase, 'nothing'), '/usr/bin/node')).toBe(false);
  });
});

describe('UsageLimitsWatch', () => {
  it('sends the setup and what the status line left on disk', () => {
    const file = path.join(tmpBase, 'limites.json');
    const snap = { observedAt: 5, fiveHour: { usedPercentage: 12, resetsAt: 99 } };
    fs.writeFileSync(file, JSON.stringify(snap));
    const watch = new UsageLimitsWatch({ broadcast: () => {}, packageRoot: tmpBase, file });
    watch.start();
    expect(watch.message()).toEqual({ type: 'usageLimits', setup: 'off', ...snap });
    watch.stop();
  });

  it('broadcasts on refresh only when something changed', () => {
    const file = path.join(tmpBase, 'limites.json');
    const sent: unknown[] = [];
    const watch = new UsageLimitsWatch({
      broadcast: (m) => sent.push(m),
      packageRoot: tmpBase,
      file,
    });
    watch.start();
    watch.refresh();
    expect(sent).toHaveLength(0);
    fs.writeFileSync(
      file,
      JSON.stringify({ observedAt: 7, sevenDay: { usedPercentage: 3, resetsAt: 9 } }),
    );
    watch.refresh();
    expect(sent).toEqual([
      {
        type: 'usageLimits',
        setup: 'off',
        observedAt: 7,
        sevenDay: { usedPercentage: 3, resetsAt: 9 },
      },
    ]);
    watch.stop();
  });

  it('turning on installs the files and the setting; off takes them out', async () => {
    const sent: Array<{ setup: string }> = [];
    const watch = new UsageLimitsWatch({
      broadcast: (m) => sent.push(m),
      packageRoot: fakePackage(),
      file: path.join(tmpBase, 'limites.json'),
    });
    expect(await watch.setEnabled(true)).toBeNull();
    expect(readSettings().statusLine.command).toBe(STATUS_LINE_COMMAND);
    expect(sent.at(-1)?.setup).toBe('ours');
    expect(await watch.setEnabled(false)).toBeNull();
    expect(readSettings().statusLine).toBeUndefined();
    expect(sent.at(-1)?.setup).toBe('off');
  });

  it('says why it could not turn on', async () => {
    writeSettings({ statusLine: { type: 'command', command: 'mine.sh' } });
    const watch = new UsageLimitsWatch({
      broadcast: () => {},
      packageRoot: fakePackage(),
      file: path.join(tmpBase, 'limites.json'),
    });
    expect(await watch.setEnabled(true)).toBe(FOREIGN_STATUS_LINE_MESSAGE);
    expect(watch.message().setup).toBe('foreign');
  });
});
