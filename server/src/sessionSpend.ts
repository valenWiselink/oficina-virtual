import * as fs from 'fs';
import * as readline from 'readline';

import type { AgentStateStore } from './agentStateStore.js';
import type { AgentState, SessionSpend } from './types.js';

/**
 * What an agent's session has spent so far, and the model answering it — the
 * "Opus 5.5 · 3,1 M leídos" next to the context gauge.
 *
 * Unlike the context (a snapshot of the newest turn), spend is a running
 * total: every API request of the transcript adds its four usage counters.
 * Claude Code writes one record per content block of a message, each carrying
 * the same usage, so requests are counted once by message id (or request id).
 */

interface UsageBlock {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface SpendRecord {
  isSidechain?: boolean;
  requestId?: string;
  message?: { id?: string; model?: string; usage?: UsageBlock };
}

/** Request keys remembered to drop repeats: the records of one message are
 *  written back to back, so a short window is enough. */
const RECENT_KEYS = 64;

export const noSpend = (): SessionSpend => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

const count = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

/** The usage one record reports, or null (no usage, or all zero: synthetic). */
export function spendOf(record: unknown): SessionSpend | null {
  const usage = (record as SpendRecord | null)?.message?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const spend = {
    input: count(usage.input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    output: count(usage.output_tokens),
  };
  return spend.input + spend.cacheRead + spend.cacheWrite + spend.output > 0 ? spend : null;
}

function requestKeyOf(record: unknown): string | undefined {
  const r = record as SpendRecord | null;
  return r?.message?.id ?? r?.requestId;
}

/** The model a record was written by, ignoring Claude Code's synthetic ones. */
function modelOf(record: unknown): string | undefined {
  const model = (record as SpendRecord | null)?.message?.model;
  return typeof model === 'string' && model && model !== '<synthetic>' ? model : undefined;
}

/** Running totals plus the request keys already counted. */
export interface SpendTally {
  spend: SessionSpend;
  recent: string[];
  model?: string;
  /** The model came from the main conversation (sub-agents can't replace it). */
  modelFromMain?: boolean;
  /** The first request this tally counted: the one a seed may share with it. */
  firstSpend?: { key: string; spend: SessionSpend };
}

export const newTally = (): SpendTally => ({ spend: noSpend(), recent: [] });

/**
 * Fold one record into a tally. Returns true when the totals or the model
 * changed. Sidechain records count toward the spend (they are requests of
 * this transcript) but only name the model until the main chain has.
 */
export function tallyRecord(tally: SpendTally, record: unknown): boolean {
  const spend = spendOf(record);
  if (!spend) return false;
  let changed = false;
  const model = modelOf(record);
  const sidechain = (record as SpendRecord).isSidechain === true;
  if (model && (!sidechain || !tally.modelFromMain) && tally.model !== model) {
    tally.model = model;
    changed = true;
  }
  if (model && !sidechain) tally.modelFromMain = true;

  const key = requestKeyOf(record);
  if (key !== undefined) {
    if (tally.recent.includes(key)) return changed;
    tally.recent.push(key);
    if (tally.recent.length > RECENT_KEYS) tally.recent.shift();
    tally.firstSpend ??= { key, spend };
  }
  tally.spend.input += spend.input;
  tally.spend.cacheRead += spend.cacheRead;
  tally.spend.cacheWrite += spend.cacheWrite;
  tally.spend.output += spend.output;
  return true;
}

function tallyOf(agent: AgentState): SpendTally {
  agent.spendTally ??= newTally();
  return agent.spendTally;
}

/** Live: one freshly read record of the agent's transcript. */
export function updateSessionSpend(agent: AgentState, record: unknown): boolean {
  return tallyRecord(tallyOf(agent), record);
}

/** The fields `agentContextUsage` carries for the spend and the model. */
export function spendFields(agent: AgentState): Record<string, unknown> {
  const tally = agent.spendTally;
  if (!tally) return {};
  return {
    model: tally.model,
    spentInput: tally.spend.input,
    spentCacheRead: tally.spend.cacheRead,
    spentCacheWrite: tally.spend.cacheWrite,
    spentOutput: tally.spend.output,
  };
}

/**
 * Seed the totals of an agent watched from mid-file: read the transcript up to
 * where the stream starts, in the background (a long session is megabytes),
 * and add it under what the stream counted meanwhile. A message whose records
 * straddle the start is counted once.
 */
/** Agent + transcript pairs already seeded: a watch restarted on the same file
 *  must not add its history twice. */
const seeded = new Set<string>();

export async function seedSessionSpend(
  agentId: number,
  agents: AgentStateStore,
  onDone: (agentId: number) => void,
): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent?.jsonlFile || agent.fileOffset <= 0) return;
  const once = `${agentId}:${agent.jsonlFile}`;
  if (seeded.has(once)) return;
  seeded.add(once);
  const history = newTally();
  try {
    const lines = readline.createInterface({
      input: fs.createReadStream(agent.jsonlFile, { start: 0, end: agent.fileOffset - 1 }),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line.startsWith('{')) continue;
      try {
        tallyRecord(history, JSON.parse(line));
      } catch {
        /* a broken line: skip it */
      }
    }
  } catch {
    return; // unreadable: the totals start from what the stream sees
  }
  const live = agents.get(agentId);
  if (!live) return;
  live.spendTally = mergeTallies(history, live.spendTally ?? newTally());
  onDone(agentId);
}

/** History first, then the live part; the live model is the newer one. The
 *  live side's first request may be a message whose earlier records the seed
 *  already counted (the stream started between them): that one counts once. */
export function mergeTallies(before: SpendTally, after: SpendTally): SpendTally {
  const keys = Object.keys(before.spend) as Array<keyof SessionSpend>;
  const spend = { ...before.spend };
  for (const k of keys) spend[k] += after.spend[k];
  const shared = after.firstSpend && before.recent.includes(after.firstSpend.key);
  if (shared) for (const k of keys) spend[k] -= after.firstSpend!.spend[k];
  return {
    spend,
    recent: [...before.recent, ...after.recent.filter((k) => !before.recent.includes(k))].slice(
      -RECENT_KEYS,
    ),
    model: after.model ?? before.model,
    modelFromMain: after.modelFromMain || before.modelFromMain,
    firstSpend: before.firstSpend ?? after.firstSpend,
  };
}
