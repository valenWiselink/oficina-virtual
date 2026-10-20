import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import type { SubagentWatch } from '../src/subagentWatch.js';
import type { AgentState } from '../src/types.js';
import { parseJournal, WorkflowWatch } from '../src/workflowWatch.js';

// Journal records as Claude Code writes them for a Workflow run.
const started = (agentId: string, label: string) =>
  JSON.stringify({ type: 'started', key: `v2:${agentId}`, agentId, label, phase: 'Propuestas' });
const result = (agentId: string) =>
  JSON.stringify({ type: 'result', key: `v2:${agentId}`, agentId, result: 'listo' });

describe('parseJournal', () => {
  it('reads who started (with label) and who returned', () => {
    const state = parseJournal(
      [
        JSON.stringify({ type: 'launched' }),
        started('a1', 'propuesta:diseno'),
        started('a2', ''),
        result('a1'),
      ].join('\n'),
    );
    expect(state.started.get('a1')?.label).toBe('propuesta:diseno');
    expect(state.started.get('a2')?.label).toBe('Agente de la junta');
    expect([...state.finished]).toEqual(['a1']);
  });

  it('skips a half-written last line', () => {
    expect(parseJournal(`${started('a1', 'x')}\n{"type":"sta`).started.size).toBe(1);
  });
});

describe('WorkflowWatch', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function setup(now: number) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-watch-'));
    dirs.push(dir);
    const run = path.join(dir, 'sess', 'subagents', 'workflows', 'wf_1');
    fs.mkdirSync(run, { recursive: true });
    const store = new AgentStateStore();
    store.set(1, {
      id: 1,
      sessionId: 'sess',
      jsonlFile: path.join(dir, 'sess.jsonl'),
    } as AgentState);
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
    const watched: string[] = [];
    const removed: string[] = [];
    const subagents = {
      watch: (_lead: AgentState, _id: number, e: { toolUseId: string }) =>
        watched.push(e.toolUseId),
      removeBySpawn: (_id: number, key: string) => removed.push(key),
    } as unknown as SubagentWatch;
    const watch = new WorkflowWatch(store, subagents, () => now);
    return { run, sent, watched, removed, watch };
  }

  it('shows a started agent as a named sub-agent of its session, until it returns', () => {
    const { run, sent, watched, removed, watch } = setup(Date.now());
    fs.writeFileSync(path.join(run, 'agent-a1.jsonl'), '{}\n');
    fs.writeFileSync(path.join(run, 'journal.jsonl'), `${started('a1', 'propuesta:diseno')}\n`);

    watch.scan();
    expect(sent[0]).toMatchObject({
      type: 'agentToolStart',
      id: 1,
      toolId: 'wf:wf_1:a1',
      status: 'Subtask: propuesta:diseno',
      runInBackground: true,
    });
    expect(watched).toEqual(['wf:wf_1:a1']);

    fs.appendFileSync(path.join(run, 'journal.jsonl'), `${result('a1')}\n`);
    watch.scan();
    expect(removed).toEqual(['wf:wf_1:a1']);
    expect(sent.at(-1)).toMatchObject({ type: 'subagentClear', id: 1, parentToolId: 'wf:wf_1:a1' });
  });

  it('never shows an agent whose transcript went silent (a killed run)', () => {
    const { run, sent, watch } = setup(Date.now() + 10 * 60 * 1000);
    fs.writeFileSync(path.join(run, 'agent-a1.jsonl'), '{}\n');
    fs.writeFileSync(path.join(run, 'journal.jsonl'), `${started('a1', 'x')}\n`);
    watch.scan();
    expect(sent).toEqual([]);
  });

  it('re-announces live agents to a client that reconnects', () => {
    const { run, watch } = setup(Date.now());
    fs.writeFileSync(path.join(run, 'agent-a1.jsonl'), '{}\n');
    fs.writeFileSync(path.join(run, 'journal.jsonl'), `${started('a1', 'moderador')}\n`);
    watch.scan();
    const resent: Array<Record<string, unknown>> = [];
    watch.resend((m) => resent.push(m));
    expect(resent).toEqual([
      expect.objectContaining({ toolId: 'wf:wf_1:a1', status: 'Subtask: moderador' }),
    ]);
  });
});
