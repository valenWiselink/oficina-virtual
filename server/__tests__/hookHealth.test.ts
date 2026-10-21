import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookHealth as HookHealthMessage } from '../../core/src/messages.js';
import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  HOOK_HEALTH_THRESHOLD,
  HOOK_HEALTH_WINDOW_MS,
  hookFailureOf,
  HookHealth,
  setCurrentHookHealth,
} from '../src/hookHealth.js';
import { processTranscriptLine } from '../src/transcriptParser.js';
import { setRecordTap } from '../src/transcriptTaps.js';
import type { AgentState } from '../src/types.js';

describe('the transcript parser hands every record to the tap', () => {
  afterEach(() => setRecordTap(null));

  it('passes an attachment record through', () => {
    const store = new AgentStateStore();
    store.set(1, {
      id: 1,
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      seenUnknownRecordTypes: new Set(),
      contextTokens: 0,
      maxContextTokens: 1_000_000,
    } as unknown as AgentState);
    const tapped: unknown[] = [];
    setRecordTap((_id, record) => tapped.push(record));
    const record = { type: 'attachment', attachment: { type: 'hook_cancelled' } };
    processTranscriptLine(1, JSON.stringify(record), store, new Map(), new Map());
    expect(tapped).toEqual([record]);
  });
});

const EXE_COMMAND =
  'C:\\Users\\Sebas\\AppData\\Local\\Programs\\oficina-virtual\\Oficina virtual.exe --oficina-hook C:\\Users\\Sebas\\.pixel-agents\\hooks\\claude-hook.js';

/** Shaped like the records Claude Code 2.1.304 wrote on 2026-10-20/21. */
function cancelled(at: number, uuid: string, durationMs = 6694) {
  return {
    type: 'attachment',
    uuid,
    timestamp: new Date(at).toISOString(),
    attachment: {
      type: 'hook_cancelled',
      hookName: 'PreToolUse:Bash',
      hookEvent: 'PreToolUse',
      command: EXE_COMMAND,
      durationMs,
      timedOut: true,
      timeoutMs: 5000,
    },
  };
}

function failed(at: number, uuid: string, command = EXE_COMMAND) {
  return {
    type: 'attachment',
    uuid,
    timestamp: new Date(at).toISOString(),
    attachment: {
      type: 'hook_non_blocking_error',
      hookName: 'SessionStart:startup',
      hookEvent: 'SessionStart',
      stderr: `Failed with non-blocking status code: ${EXE_COMMAND.split(' --')[0]}: bad option: --oficina-hook`,
      exitCode: 9,
      command,
    },
  };
}

describe('hookFailureOf', () => {
  it('reads a cut hook of the office (exe form)', () => {
    expect(hookFailureOf(cancelled(1000, 'u1'))).toMatchObject({
      id: 'u1',
      at: 1000,
      timedOut: true,
      durationMs: 6694,
    });
  });

  it('reads a failed hook of the office with its error', () => {
    expect(hookFailureOf(failed(1000, 'u2'))?.error).toMatch(/bad option: --oficina-hook$/);
  });

  it('recognizes the node form too', () => {
    const node = 'node "C:\\Users\\Sebas\\.pixel-agents\\hooks\\claude-hook.js"';
    expect(hookFailureOf(failed(1000, 'u3', node))).not.toBeNull();
  });

  it("ignores somebody else's hook and other records", () => {
    const python = 'python "$CLAUDE_PROJECT_DIR/.claude/hooks/block-secrets.py"';
    expect(hookFailureOf(failed(1000, 'u4', python))).toBeNull();
    expect(hookFailureOf({ type: 'attachment', attachment: { type: 'hook_success' } })).toBeNull();
    expect(hookFailureOf({ type: 'assistant' })).toBeNull();
    expect(hookFailureOf(null)).toBeNull();
  });
});

describe('HookHealth', () => {
  let now: number;
  let seen: HookHealthMessage[];
  let health: HookHealth;

  beforeEach(() => {
    vi.useFakeTimers();
    now = Date.parse('2026-10-21T09:30:00Z');
    vi.setSystemTime(now);
    seen = [];
    health = new HookHealth(
      (s) => seen.push(s),
      () => now,
    );
  });
  afterEach(() => {
    health.dispose();
    setCurrentHookHealth(null);
    vi.useRealTimers();
  });

  const feed = (n: number, from = 0) => {
    for (let i = 0; i < n; i++) health.observe(cancelled(now - 1000 * (i + 1), `u${from + i}`));
  };

  it('stays quiet under the threshold', () => {
    feed(HOOK_HEALTH_THRESHOLD - 1);
    expect(seen).toEqual([]);
    expect(health.status().failing).toBe(false);
  });

  it('says so once the threshold is reached, with counts', () => {
    feed(HOOK_HEALTH_THRESHOLD);
    expect(seen.at(-1)).toMatchObject({
      type: 'hookHealth',
      failing: true,
      failures: HOOK_HEALTH_THRESHOLD,
      timedOut: HOOK_HEALTH_THRESHOLD,
      slowestMs: 6694,
    });
  });

  it('counts a re-read record once', () => {
    for (let i = 0; i < HOOK_HEALTH_THRESHOLD; i++) health.observe(cancelled(now - 1000, 'same'));
    expect(health.status().failures).toBe(1);
  });

  it('does not count failures older than the window (a transcript read from the start)', () => {
    for (let i = 0; i < 10; i++) {
      health.observe(cancelled(now - HOOK_HEALTH_WINDOW_MS - 1000 * (i + 1), `old${i}`));
    }
    expect(health.status().failures).toBe(0);
    expect(seen).toEqual([]);
  });

  it('takes the warning back when the failures leave the window', () => {
    feed(HOOK_HEALTH_THRESHOLD);
    now += HOOK_HEALTH_WINDOW_MS;
    vi.advanceTimersByTime(HOOK_HEALTH_WINDOW_MS);
    expect(seen.at(-1)).toMatchObject({ failing: false, failures: 0 });
  });

  it('tells a client that connects while failing', () => {
    setCurrentHookHealth(health);
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), new AgentStateStore());
    expect(sent).toEqual([]);
    feed(HOOK_HEALTH_THRESHOLD);
    resendAgentActivity((m) => sent.push(m), new AgentStateStore());
    expect(sent[0]).toMatchObject({ type: 'hookHealth', failing: true });
  });
});
