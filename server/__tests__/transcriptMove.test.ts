import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { HookEventHandler } from '../src/hookEventHandler.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { SessionRouter } from '../src/sessionRouter.js';
import { transcriptMoved } from '../src/transcriptMove.js';
import type { AgentState } from '../src/types.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-move-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function file(name: string, mtimeMs?: number): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '{}\n');
  if (mtimeMs !== undefined) fs.utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
  return p;
}

describe('where a session writes its conversation', () => {
  it('moved: the followed file is not there and the reported one is', () => {
    const real = file('real.jsonl');
    expect(transcriptMoved(path.join(dir, 'gone.jsonl'), real)).toBe(true);
  });

  it('moved: the reported file is newer than the followed one', () => {
    const old = file('old.jsonl', 1_000_000_000_000);
    const real = file('real.jsonl', 1_000_000_060_000);
    expect(transcriptMoved(old, real)).toBe(true);
  });

  it('not moved: same file, a missing report, or an older reported file', () => {
    const followed = file('same.jsonl', 1_000_000_060_000);
    expect(transcriptMoved(followed, followed.toUpperCase())).toBe(process.platform !== 'win32');
    expect(transcriptMoved(followed, undefined)).toBe(false);
    expect(transcriptMoved(followed, path.join(dir, 'missing.jsonl'))).toBe(false);
    expect(transcriptMoved(followed, file('older.jsonl', 1_000_000_000_000))).toBe(false);
  });
});

describe('hooks of an agent whose conversation moved', () => {
  function setup(jsonlFile: string) {
    const agents = new AgentStateStore();
    agents.set(1, {
      id: 1,
      sessionId: 'sess-1',
      jsonlFile,
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      seenUnknownRecordTypes: new Set(),
    } as unknown as AgentState);
    const handler = new HookEventHandler(
      agents,
      new Map(),
      new Map(),
      claudeProvider,
      new SessionRouter(),
    );
    handler.registerAgent('sess-1', 1);
    const onTranscriptMoved = vi.fn();
    handler.setLifecycleCallbacks({ onTranscriptMoved });
    return { handler, onTranscriptMoved };
  }

  it('follow the file the hook reports', () => {
    const real = file('real.jsonl');
    const { handler, onTranscriptMoved } = setup(path.join(dir, 'where-it-was-launched.jsonl'));
    handler.handleEvent('claude', {
      hook_event_name: 'Stop',
      session_id: 'sess-1',
      transcript_path: real,
    });
    expect(onTranscriptMoved).toHaveBeenCalledWith(1, real);
  });

  it('stay when the hook reports the file it already follows', () => {
    const real = file('real.jsonl');
    const { handler, onTranscriptMoved } = setup(real);
    handler.handleEvent('claude', {
      hook_event_name: 'Stop',
      session_id: 'sess-1',
      transcript_path: real,
    });
    expect(onTranscriptMoved).not.toHaveBeenCalled();
  });
});
