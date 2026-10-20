import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claudeProvider } from '../src/providers/index.js';
import { ResumableSessions } from '../src/terminal/resumableSessions.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-resumable-test-'));
  file = path.join(dir, 'sessions.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const a = { sessionId: 'a', cwd: 'F:\\repo-a', directoryName: 'repo-a', palette: 2, hueShift: 0 };
const b = { sessionId: 'b', cwd: 'F:\\repo-b' };

describe('ResumableSessions', () => {
  it('keeps launched sessions across instances (survives the server)', () => {
    const first = new ResumableSessions(file);
    first.add(a);
    first.add(b);
    expect(new ResumableSessions(file).list()).toEqual([a, b]);
  });

  it('drops a session closed by the user or exited on its own', () => {
    const sessions = new ResumableSessions(file);
    sessions.add(a);
    sessions.add(b);
    sessions.remove('a');
    expect(sessions.list()).toEqual([b]);
  });

  it('re-adding a resumed session does not duplicate it', () => {
    const sessions = new ResumableSessions(file);
    sessions.add(a);
    sessions.add({ ...a, palette: 3 });
    expect(sessions.list()).toEqual([{ ...a, palette: 3 }]);
  });

  it('keeps every session once frozen for shutdown', () => {
    const sessions = new ResumableSessions(file);
    sessions.add(a);
    sessions.freeze();
    sessions.remove('a'); // the dying terminal's exit handler
    expect(new ResumableSessions(file).list()).toEqual([a]);
  });

  it('reads a missing or corrupt file as empty, skipping malformed entries', () => {
    expect(new ResumableSessions(file).list()).toEqual([]);
    fs.writeFileSync(file, '{not json');
    expect(new ResumableSessions(file).list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify([a, { sessionId: 1 }, null]));
    expect(new ResumableSessions(file).list()).toEqual([a]);
  });
});

describe('claude launch command', () => {
  it('starts a fresh session with --session-id', () => {
    expect(claudeProvider.buildLaunchCommand!('id-1', 'F:\\x').args).toEqual([
      '--session-id',
      'id-1',
    ]);
  });

  it('continues the same session with --resume', () => {
    expect(claudeProvider.buildLaunchCommand!('id-1', 'F:\\x', { resume: true }).args).toEqual([
      '--resume',
      'id-1',
    ]);
  });
});
