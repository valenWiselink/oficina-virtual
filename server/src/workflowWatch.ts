/**
 * WorkflowWatch: the agents a session runs through the Workflow tool (a
 * "junta" of several agents) shown as that session's sub-agents.
 *
 * Workflow agents are not Task/Agent spawns: nothing on the lead's transcript
 * announces them. What Claude Code does write is, per run,
 * <projectDir>/<sessionId>/subagents/workflows/<runId>/journal.jsonl — one
 * `started` record (agentId, label, phase) when an agent begins and a
 * `result` record when it returns — next to each agent's own transcript
 * (agent-<agentId>.jsonl). That journal is the evidence used here:
 *
 * - live = started, no result yet, AND its transcript written recently. The
 *   freshness check keeps a run that was killed mid-way (no result ever
 *   written) from showing agents working forever.
 * - Each live agent is announced on the lead like a background Subtask (the
 *   sub-character gets the agent's label) and its transcript is followed by
 *   SubagentWatch, so its tools animate like any sub-agent's.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { AgentStateStore } from './agentStateStore.js';
import type { SubagentWatch } from './subagentWatch.js';
import type { AgentState } from './types.js';

const SCAN_INTERVAL_MS = 1500;
/** A started agent whose transcript has been silent this long is not working. */
const STALE_MS = 3 * 60 * 1000;

export interface JournalState {
  started: Map<string, { label: string; phase?: string }>;
  finished: Set<string>;
}

/** Read a workflow journal: who started (with label) and who returned. */
export function parseJournal(text: string): JournalState {
  const state: JournalState = { started: new Map(), finished: new Set() };
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      const agentId = typeof rec.agentId === 'string' ? rec.agentId : undefined;
      if (!agentId) continue;
      if (rec.type === 'started') {
        const label = typeof rec.label === 'string' && rec.label ? rec.label : 'Agente de la junta';
        const phase = typeof rec.phase === 'string' ? rec.phase : undefined;
        state.started.set(agentId, { label, phase });
      } else {
        // `result` (and any other terminal record naming the agent) ends it.
        state.finished.add(agentId);
      }
    } catch {
      /* a line being written right now */
    }
  }
  return state;
}

interface LiveWorkflowAgent {
  leadId: number;
  key: string;
  label: string;
}

export class WorkflowWatch {
  /** spawn key (wf:<runId>:<agentId>) → who it belongs to and its label. */
  private readonly live = new Map<string, LiveWorkflowAgent>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: AgentStateStore,
    private readonly subagents: SubagentWatch,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const key of [...this.live.keys()]) this.retire(key);
  }

  /** Re-announce live workflow agents to a client that just connected. */
  resend(send: (message: Record<string, unknown>) => void): void {
    for (const agent of this.live.values()) send(this.announcement(agent));
  }

  /** One pass over every watched session's workflow runs. */
  scan(): void {
    const seen = new Set<string>();
    for (const [leadId, lead] of this.store) {
      if (lead.leadAgentId !== undefined) continue; // sub/teammate, not a session
      for (const found of this.liveAgentsOf(lead)) {
        const key = `wf:${found.runId}:${found.agentId}`;
        seen.add(key);
        if (!this.live.has(key)) this.adopt(lead, leadId, key, found.label, found.jsonlPath);
      }
    }
    for (const key of [...this.live.keys()]) if (!seen.has(key)) this.retire(key);
  }

  private liveAgentsOf(
    lead: AgentState,
  ): Array<{ runId: string; agentId: string; label: string; jsonlPath: string }> {
    if (!lead.jsonlFile || !lead.sessionId) return [];
    const root = path.join(path.dirname(lead.jsonlFile), lead.sessionId, 'subagents', 'workflows');
    let runs: string[];
    try {
      runs = fs.readdirSync(root);
    } catch {
      return [];
    }
    const out: Array<{ runId: string; agentId: string; label: string; jsonlPath: string }> = [];
    for (const runId of runs) {
      const journal = readText(path.join(root, runId, 'journal.jsonl'));
      if (!journal) continue;
      const state = parseJournal(journal);
      for (const [agentId, info] of state.started) {
        if (state.finished.has(agentId)) continue;
        const jsonlPath = path.join(root, runId, `agent-${agentId}.jsonl`);
        if (!this.isFresh(jsonlPath)) continue;
        out.push({ runId, agentId, label: info.label, jsonlPath });
      }
    }
    return out;
  }

  private isFresh(file: string): boolean {
    try {
      return this.now() - fs.statSync(file).mtimeMs < STALE_MS;
    } catch {
      return false; // not written yet: nothing to show
    }
  }

  private adopt(lead: AgentState, leadId: number, key: string, label: string, jsonlPath: string) {
    const agent = { leadId, key, label };
    this.live.set(key, agent);
    this.store.broadcast(this.announcement(agent));
    this.subagents.watch(lead, leadId, { jsonlPath, toolUseId: key });
  }

  private retire(key: string): void {
    const agent = this.live.get(key);
    if (!agent) return;
    this.live.delete(key);
    this.subagents.removeBySpawn(agent.leadId, key);
    this.store.broadcast({ type: 'agentToolDone', id: agent.leadId, toolId: key });
    this.store.broadcast({ type: 'subagentClear', id: agent.leadId, parentToolId: key });
  }

  /** Announced like a background Subtask so the webview names the sub-character. */
  private announcement(agent: LiveWorkflowAgent): Record<string, unknown> {
    return {
      type: 'agentToolStart',
      id: agent.leadId,
      toolId: agent.key,
      status: `Subtask: ${agent.label}`,
      toolName: 'Agent',
      runInBackground: true,
    };
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}
