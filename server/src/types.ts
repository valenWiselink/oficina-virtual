import type * as vscode from 'vscode';

import type { SpendTally } from './sessionSpend.js';
import type { SupervisionScope } from './supervisors/supervision.js';

export interface AgentState {
  id: number;
  sessionId: string;
  /** Terminal reference — undefined for extension panel sessions */
  terminalRef?: vscode.Terminal;
  /** Whether this agent was detected from an external source (VS Code extension panel, etc.) */
  isExternal: boolean;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>; // parentToolId → active sub-tool IDs
  activeSubagentToolNames: Map<string, Map<string, string>>; // parentToolId → (subToolId → toolName)
  backgroundAgentToolIds: Set<string>; // tool IDs for run_in_background Agent calls (stay alive until queue-operation)
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  /** Directory name — the agent's origin label (only set for multi-root workspaces) */
  directoryName?: string;
  /** Timestamp of last JSONL data received (ms since epoch) */
  lastDataAt: number;
  /** Total JSONL lines processed for this agent */
  linesProcessed: number;
  /** Set of record.type values we've already warned about (prevents log spam) */
  seenUnknownRecordTypes: Set<string>;
  /** Whether a hook event has been delivered for this agent (suppresses heuristic timers) */
  hookDelivered: boolean;
  /** True when agent has no transcript file (provider doesn't use JSONL). All state from hooks. */
  hooksOnly?: boolean;
  /** Provider that created this agent (defaults to 'claude') */
  providerId?: string;
  /** Set when SessionEnd(reason=clear) fires; cleared when SessionStart(source=clear) reassigns */
  pendingClear?: boolean;
  /** Hook-generated tool ID for PreToolUse/PostToolUse correlation */
  currentHookToolId?: string;
  /** Tool name from the most recent PreToolUse, used to correlate a later SubagentStart
   *  event with the parent tool that launched it. */
  currentHookToolName?: string;
  /** True if the CURRENT PreToolUse tool call is a teammate spawn (per the provider's
   *  `team.isTeammateSpawnCall`). Authoritative source for teammate vs basic-subagent
   *  routing in SubagentStart. Set in PreToolUse, NOT cleared in PostToolUse (survives
   *  the PostToolUse-before-SubagentStart race); overwritten on the next PreToolUse. */
  currentHookIsTeammateSpawn?: boolean;

  // -- Context window usage (server/src/contextUsage.ts) --
  /** Tokens in the agent's context as of its newest turn; 0 until one is seen.
   *  A snapshot, not a running total -- it falls on compaction and /clear. */
  contextTokens: number;
  /** Observational estimate of the window `contextTokens` fits in. Widens as
   *  larger contexts appear, never shrinks. */
  maxContextTokens: number;
  /** True once this transcript produced a main-chain turn, after which
   *  sidechain records belong to sub-agents and stop moving the gauge. */
  sawMainChainUsage?: boolean;
  /** What the session spent so far and the model answering it
   *  (server/src/sessionSpend.ts); absent until a turn with usage is seen. */
  spendTally?: SpendTally;

  // -- Agent Teams --
  teamName?: string;
  agentName?: string;
  /** True when teamName was read from the session's own record tags (tmux/
   *  inline teams, teammate sessions). Tag identity is authoritative: spawn-
   *  result re-latching (implicit-team generations on resume) only applies to
   *  tag-less leads. Transient — not persisted. */
  teamNameFromTags?: boolean;
  isTeamLead?: boolean;
  leadAgentId?: number;
  /** True when lead spawns teammates via tmux (run_in_background Agent calls) */
  teamUsesTmux?: boolean;
  /** For a promoted anonymous background agent (teams OFF): the lead's Agent
   *  tool_use id that spawned it. Links this character to the lead's
   *  backgroundAgentToolIds entry so the queue-operation completion removes it. */
  spawnToolUseId?: string;
  /** Tool ids of spawn calls whose input carried a `name` — teammates-to-be.
   *  Every agentToolStart (re-)broadcast for these carries isTeammateSpawn so
   *  the webview never creates a Subtask ghost for them. Transient, lazily
   *  created, never persisted. */
  teammateSpawnToolIds?: Set<string>;

  // -- Avatar customization --
  /** Preferred character palette (0-5). If undefined, auto-assigned for diversity. */
  palette?: number;
  /** Hue shift in degrees (0-360). Rotates the base palette colors. */
  hueShift?: number;

  // -- Identity (server/src/agentIdentity.ts) --
  /** Name the user gave the agent when launching it from the office. */
  nickname?: string;
  /** Session title: the user's /rename, else the one Claude Code generates. */
  sessionTitle?: string;
  /** True once the title came from /rename: Claude's generated title no longer replaces it. */
  sessionTitleIsCustom?: boolean;
  /** Working directory of the session, as its transcript records it. */
  cwd?: string;
  /** Git branch the session runs on (absent when detached / unknown). */
  gitBranch?: string;
  /** Where the session runs, as Claude Code records it: 'cli' (a terminal),
   *  'claude-desktop' (the desktop app, which the office can't take over)... */
  entrypoint?: string;
  /** Reasoning effort of its latest main-chain turn, as the transcript records
   *  it ("high", "xhigh"...). */
  effort?: string;
  /** Model and effort chosen from the office (launch dialog or "Editar"):
   *  the --model / --effort it runs with; absent = Claude Code's default. */
  runModel?: string;
  runEffort?: string;
  /** Runs in one of the office's own terminals (the only ones whose model and
   *  effort the office can change: it relaunches them). */
  officeTerminal?: boolean;
  /** Set when it is a supervisor (supervisors/supervision.ts): what it watches over. */
  supervision?: SupervisionScope;
  /** The agent's own task list (TaskCreate/TaskUpdate or TodoWrite). */
  tasks?: AgentTask[];
  /** Latest text answer of the main conversation (for handing it to another agent). */
  lastReply?: string;
  /** What that answer leaves for the operator to do ("mergear PR #812"), and
   *  the record it came from (so "done" can be marked per answer). */
  yourTurn?: { text: string; id: string; at?: number; prUrl?: string };
  /** When the session last wrote a record (ms, from the record's timestamp). */
  lastRecordAt?: number;
  /** Background work it launched and that has not reported back yet, by the
   *  launching tool_use id (a shell with run_in_background, a workflow…). */
  background?: Map<string, { label: string; at: number }>;
  /** Background task id (from the launch result) → its tool_use id. */
  backgroundIds?: Map<string, string>;
}

/** One entry of an agent's task list, as Claude Code keeps it. */
export interface AgentTask {
  /** Claude's task id (TaskCreate result), or the tool_use id until it is known. */
  id: string;
  subject: string;
  /** Present-continuous phrase Claude shows while the task runs. */
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface PersistedAgent {
  id: number;
  sessionId?: string;
  /** Terminal name — empty string for extension panel sessions */
  terminalName: string;
  /** Whether this agent was detected from an external source */
  isExternal?: boolean;
  jsonlFile: string;
  projectDir: string;
  /** Directory name — the agent's origin label (only set for multi-root workspaces) */
  directoryName?: string;
  /** Pre-Directory spelling of `directoryName`, written by releases up to
   *  v1.4.x. Read as a fallback on restore so an upgrade doesn't strip the
   *  label (and the Area-mapping key) off every agent from the previous
   *  session; never written — the next persist rewrites it as directoryName. */
  folderName?: string;

  // -- Agent Teams --
  teamName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  teamUsesTmux?: boolean;
  /** Live background-spawn tool ids on a lead. Persisted so the spawns'
   *  transcripts are re-adopted after a reload; the spawned children
   *  themselves are derived state and never persisted. */
  backgroundAgentToolIds?: string[];
  /** Preferred character palette (0-5). Persisted so colors stay stable
   *  across server restarts; assignPaletteIfNeeded is a no-op on restore. */
  palette?: number;
  /** Hue shift in degrees (0-360). Persisted alongside palette. */
  hueShift?: number;
}

/** Tokens a session's requests used, by kind (sum over its API requests). */
export interface SessionSpend {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}
