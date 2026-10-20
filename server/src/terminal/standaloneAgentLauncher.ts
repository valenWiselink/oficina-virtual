/**
 * Standalone agent launch: the PTY-backed counterpart to the VS Code adapter's
 * launchNewTerminal().
 *
 * This deliberately MIRRORS adapters/vscode/agentManager.ts rather than sharing
 * a core seam with it: that function imports `vscode` (so it can't move into
 * server/) and takes twelve positional dependencies, so unifying the two would
 * mean rewriting the whole VS Code lifecycle -- out of scope here and a certain
 * conflict with the sibling branches. What IS shared is the thing that matters:
 * both call provider.buildLaunchCommand(), so the launched command is identical.
 * Unifying the hosting is deferred (docs/design/standalone-terminal.md).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { HookProvider } from '../../../core/src/provider.js';
import { identityMessage } from '../agentIdentity.js';
import type { AgentRuntime } from '../agentRuntime.js';
import { createAgentState } from '../agentState.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { JSONL_POLL_INTERVAL_MS } from '../constants.js';
import { directoryNameForLaunch } from '../directories.js';
import { startFileWatching } from '../fileWatcher.js';
import { directoryNameFor, hostDirectory } from '../hostDirectory.js';
import { assignPaletteIfNeeded } from '../paletteAssigner.js';
import { type SupervisionScope, supervisors } from '../supervisors/supervision.js';
import type { AgentState } from '../types.js';
import type { PtySessionManager } from './ptySessionManager.js';
import type { ResumableSession } from './resumableSessions.js';
import {
  isCmdSafeArgument,
  killOrphanedSession,
  resolveWindowsCommand,
  runsThroughCmd,
} from './windowsCommand.js';

export interface LaunchStandaloneAgentDeps {
  store: AgentStateStore;
  runtime: AgentRuntime;
  ptyManager: PtySessionManager;
  provider: HookProvider;
}

export interface LaunchStandaloneAgentOptions {
  /** Path of the Directory to launch into. Defaults to the server's cwd, which
   *  is also the Directory standalone contributes as its host entry. */
  directoryPath?: string;
  /** Read from the host's persisted permission posture by the caller; never a
   *  per-launch choice made in the office. */
  bypassPermissions?: boolean;
  cols?: number;
  rows?: number;
  /** Relaunch this existing session (`--resume`) instead of starting a fresh
   *  one: the office is coming back after its terminals died with it. */
  resume?: ResumableSession;
  /** What the user chose in the launch dialog (validated by the caller). */
  nickname?: string;
  palette?: number;
  hueShift?: number;
  /** The agent's first message (a template; validated by the caller). */
  prompt?: string;
  /** --model / --effort chosen in the office (validated by the caller); a
   *  resume brings its own. */
  model?: string;
  effort?: string;
}

/** A supervisor's extra launch flags (its MCP and role files), none otherwise.
 *  A failure to write them launches it as a plain agent rather than not at all. */
function supervisorArgs(sessionId: string, scope: SupervisionScope | undefined): string[] {
  if (!scope) return [];
  try {
    return supervisors().prepareLaunch(sessionId, scope);
  } catch (err) {
    console.error(`[Pixel Agents] Supervisor files for ${sessionId}: ${String(err)}`);
    return [];
  }
}

/**
 * Spawn a Claude agent in a PTY and register it with the runtime.
 * Returns the new agent id, or null when the terminal is unavailable.
 */
export function launchStandaloneAgent(
  deps: LaunchStandaloneAgentDeps,
  options: LaunchStandaloneAgentOptions = {},
): number | null {
  const { store, runtime, ptyManager, provider } = deps;

  const resume = options.resume;
  const cwd = resume?.cwd ?? options.directoryPath ?? process.cwd();

  // Every failure reaches the office too: a launch that silently does nothing
  // leaves the user clicking + Agent with no idea why.
  const fail = (reason: string): null => {
    console.error(`[Pixel Agents] Terminal: cannot launch in ${cwd} -- ${reason}`);
    store.broadcast({ type: 'agentLaunchFailed', directoryPath: cwd, reason });
    return null;
  };

  if (!ptyManager.isAvailable()) {
    return fail(ptyManager.unavailableReason() ?? 'terminal unavailable');
  }

  const sessionId = resume?.sessionId ?? crypto.randomUUID();

  const prompt = resume ? undefined : options.prompt;
  const model = resume ? resume.model : options.model;
  const effort = resume ? resume.effort : options.effort;
  const supervision = resume?.supervision;
  const launch = provider.buildLaunchCommand?.(sessionId, cwd, {
    bypassPermissions: options.bypassPermissions,
    resume: resume !== undefined,
    prompt,
    model,
    effort,
    extraArgs: supervisorArgs(sessionId, supervision),
  });
  if (!launch) return fail('provider.buildLaunchCommand is not implemented');

  const dirs = provider.getSessionDirs?.(cwd) ?? [];
  if (dirs.length === 0) return fail('provider returned no session dirs');
  const projectDir = dirs[0];

  const id = store.nextAgentId.current++;

  const spawnable =
    process.platform === 'win32'
      ? resolveWindowsCommand(launch.command, launch.args)
      : { command: launch.command, args: launch.args };
  // Through an npm .cmd shim, cmd.exe re-parses the arguments: a first
  // message it would act on is refused instead of risking a broken or
  // hijacked command line (the native claude.exe has no such limit).
  if (prompt && runsThroughCmd(spawnable) && !isCmdSafeArgument(prompt)) {
    return fail(
      'el mensaje inicial tiene caracteres que cmd.exe no deja pasar (" % ! ^ & | < > o saltos de línea): sacalos, o instalá Claude Code nativo',
    );
  }

  let session;
  try {
    session = ptyManager.create({
      agentId: id,
      command: spawnable.command,
      args: spawnable.args,
      cwd,
      env: launch.env,
      cols: options.cols,
      rows: options.rows,
    });
  } catch (err) {
    // Roll the id back so a failed spawn doesn't burn an agent id.
    store.nextAgentId.current--;
    return fail(`spawn failed: ${String(err)}`);
  }

  // Pre-register the expected JSONL so the project scanner doesn't mistake it
  // for a /clear file, exactly as the VS Code path does.
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
  runtime.knownJsonlFiles.add(expectedFile);

  const agent = createAgentState({
    id,
    sessionId,
    // Not external: this server owns the process. External agents are the ones
    // adopted from someone else's terminal, and they're what the stale-check and
    // restore paths act on -- a PTY agent must be excluded from both.
    isExternal: false,
    projectDir,
    jsonlFile: expectedFile,
    // The character's origin label (and its Area-mapping key): the name of the
    // Directory it was launched into, as the user named it — so an entry called
    // "Side Project" labels its agents that, not "side-project", and the Areas
    // it was assigned in the modal actually match. Falls back to the basename
    // for a cwd that is no Directory at all.
    directoryName:
      resume?.directoryName ??
      directoryNameForLaunch(cwd, [hostDirectory()]) ??
      directoryNameFor(cwd),
    providerId: provider.id,
  });
  // The look and name chosen in the launch dialog — or, on a resume, the same
  // character as before the office went down.
  agent.nickname = resume?.nickname ?? options.nickname;
  agent.palette = resume?.palette ?? options.palette;
  agent.hueShift = resume?.hueShift ?? options.hueShift;
  agent.cwd = cwd;
  agent.runModel = model;
  agent.runEffort = effort;
  agent.officeTerminal = true;
  agent.supervision = supervision;
  if (resume) {
    // The transcript already holds the whole conversation: watch only what
    // comes next, or the office would replay old activity as if it were live.
    try {
      agent.fileOffset = fs.statSync(expectedFile).size;
    } catch {
      /* not there (yet): read from the start, like a fresh session */
    }
  }

  // Server-side, like every other creation path: the palette rides the
  // agentCreated broadcast and is persisted with the agent, so a reload
  // restores the same character without the webview having to save it back.
  assignPaletteIfNeeded(agent, store);
  runtime.resumableSessions?.add({
    sessionId,
    cwd,
    directoryName: agent.directoryName,
    nickname: agent.nickname,
    palette: agent.palette,
    hueShift: agent.hueShift,
    model,
    effort,
    supervision,
  });
  store.set(id, agent);
  runtime.activeAgentId.current = id;

  runtime.registerAgent(sessionId, id);
  store.persist();

  console.log(
    `[Pixel Agents] Terminal: Agent ${id} - spawned ${launch.command} (pid ${session.pid}) in ${cwd}`,
  );

  // Tell the UI a terminal exists for this agent, so the drawer opens a tab.
  // A separate message (rather than a field on agentCreated) keeps the protocol
  // change additive for the sibling branches.
  store.broadcast({ type: 'terminalSessionOpened', agentId: id });
  // Its name is on the label from the first frame, before any transcript.
  store.broadcast(identityMessage(id, agent));

  // The terminal closing is this surface's equivalent of VS Code's
  // "terminal closed -> clean up orphan" pass in fileWatcher.
  session.onExit((exit) => {
    console.log(`[Pixel Agents] Terminal: Agent ${id} - exited (code ${exit.exitCode})`);
    store.broadcast({ type: 'terminalSessionClosed', agentId: id, exitCode: exit.exitCode });
    // Closed by the user or exited on its own: nothing to resume. (While the
    // server shuts down the list is frozen, so dying terminals stay in it.)
    runtime.resumableSessions?.remove(sessionId);
    if (store.has(id)) {
      runtime.unregisterAgent(agent.sessionId);
      runtime.closeAgent(id);
    }
  });

  startJsonlPoll(deps, id, agent);

  return id;
}

/**
 * Bring back the sessions whose terminals died with the previous server run
 * (shutdown or crash): each is relaunched with `--resume` in its own folder.
 * A folder that is gone drops its session; a session Claude can no longer
 * resume exits at once and drops itself through the normal exit path.
 */
export function resumeOfficeSessions(
  deps: LaunchStandaloneAgentDeps,
  bypassPermissions: boolean,
): number {
  const sessions = deps.runtime.resumableSessions;
  if (!sessions || !deps.ptyManager.isAvailable()) return 0;
  let resumed = 0;
  for (const session of sessions.list()) {
    if (!fs.existsSync(session.cwd)) {
      sessions.remove(session.sessionId);
      continue;
    }
    const orphans = killOrphanedSession(session.sessionId);
    if (orphans > 0) {
      console.log(`[Pixel Agents] Closed ${orphans} orphaned process(es) of ${session.sessionId}`);
    }
    if (launchStandaloneAgent(deps, { resume: session, bypassPermissions }) !== null) resumed++;
  }
  return resumed;
}

/**
 * Wait for the session's JSONL to appear, then start watching it.
 *
 * Hooks (the default) already route by sessionId, so this is what backfills tool
 * content and keeps hooks-off standalone working at all. Unlike the VS Code
 * path this does NOT implement /resume reassignment -- the only resume here is
 * resumeOfficeSessions, which relaunches with the same session id.
 */
function startJsonlPoll(deps: LaunchStandaloneAgentDeps, id: number, agent: AgentState): void {
  const { store, runtime } = deps;
  let pollCount = 0;

  const timer = setInterval(() => {
    pollCount++;
    try {
      if (!fs.existsSync(agent.jsonlFile)) {
        if (pollCount === 10) {
          console.warn(
            `[Pixel Agents] Terminal: Agent ${id} - JSONL not found after 10s. Expected: ${agent.jsonlFile}`,
          );
        }
        return;
      }
      clearInterval(timer);
      runtime.jsonlPollTimers.delete(id);
      // The agent may have been closed while we waited.
      if (!store.has(id)) return;
      console.log(
        `[Pixel Agents] Terminal: Agent ${id} - found JSONL ${path.basename(agent.jsonlFile)}`,
      );
      startFileWatching(
        id,
        agent.jsonlFile,
        store,
        runtime.fileWatchers,
        runtime.pollingTimers,
        runtime.waitingTimers,
        runtime.permissionTimers,
      );
    } catch {
      // File may not exist yet, or vanished mid-check; keep polling.
    }
  }, JSONL_POLL_INTERVAL_MS);

  runtime.jsonlPollTimers.set(id, timer);
}
