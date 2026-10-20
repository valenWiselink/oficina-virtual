import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findLiveSession } from '../src/terminal/adoptSession.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-adopt-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeSession(file: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(content));
}

describe('findLiveSession', () => {
  it("finds a running session's process in Claude Code's registry", () => {
    writeSession(`${process.pid}.json`, {
      pid: process.pid,
      sessionId: 's-1',
      cwd: 'F:\\repo',
      entrypoint: 'cli',
      status: 'idle',
    });
    expect(findLiveSession('s-1', dir)).toMatchObject({ pid: process.pid, entrypoint: 'cli' });
  });

  it('ignores dead processes, other sessions and unreadable files', () => {
    writeSession('999999.json', { pid: 999_999_999, sessionId: 's-1' });
    writeSession(`${process.pid}.json`, { pid: process.pid, sessionId: 'otra' });
    fs.writeFileSync(path.join(dir, 'roto.json'), '{');
    expect(findLiveSession('s-1', dir)).toBeNull();
  });

  it('is null without a registry', () => {
    expect(findLiveSession('s-1', path.join(dir, 'no-existe'))).toBeNull();
  });
});
