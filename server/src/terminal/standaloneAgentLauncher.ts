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
import { spinnerLaunchArgs } from '../spinnerSettings.js';
import { type SupervisionScope, supervisors } from '../supervisors/supervision.js';
import { ruleLaunchArgs } from '../teTocaRule.js';
import type { AgentState } from '../types.js';
import {
  attachCommand,
  backgroundAgentsOn,
  backgroundArgs,
  backgroundName,
  findBackground,
  startBackground,
  stopBackground,
  WorkspaceNotTrustedError,
} from './backgroundSessions.js';
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
  /** Show this Claude Code background session instead of starting Claude:
   *  the terminal runs `claude attach <bgId>` (backgroundSessions.ts). */
  attach?: { bgId: string; sessionId: string; name?: string };
  /** Launch it as a supervisor of this scope (validated by the caller); a
   *  resume brings its own. */
  supervision?: SupervisionScope;
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

/** Every launch's extra flags: Claude Code in Spanish (spinnerSettings.ts;
 *  first, so a supervisor's variadic --allowedTools still ends the list),
 *  then a supervisor's files, or else the "Te toca" rule (teTocaRule.ts) — at
 *  most one --append-system-prompt-file, which is all Claude Code reads.
 *  Built anew on every launch, resume and relaunch. */
function launchExtras(filesId: string | undefined, scope: SupervisionScope | undefined): string[] {
  const supervisor = filesId ? supervisorArgs(filesId, scope) : [];
  return [...spinnerLaunchArgs(), ...(supervisor.length > 0 ? supervisor : ruleLaunchArgs())];
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

  const attach = options.attach;
  const sessionId = attach?.sessionId ?? resume?.sessionId ?? crypto.randomUUID();

  const prompt = resume || attach ? undefined : options.prompt;
  const model = resume ? resume.model : options.model;
  const effort = resume ? resume.effort : options.effort;
  const supervision = resume ? resume.supervision : options.supervision;
  // Attaching: the session already runs with its flags (and a supervisor's
  // token, which must not rotate under it), so nothing is rebuilt.
  const launch = attach
    ? { command: 'claude', args: [] as string[], env: { PWD: cwd } as Record<string, string> }
    : provider.buildLaunchCommand?.(sessionId, cwd, {
        bypassPermissions: options.bypassPermissions,
        resume: resume !== undefined,
        prompt,
        model,
        effort,
        extraArgs: launchExtras(sessionId, supervision),
      });
  if (!launch) return fail('provider.buildLaunchCommand is not implemented');

  const dirs = provider.getSessionDirs?.(cwd) ?? [];
  if (dirs.length === 0) return fail('provider returned no session dirs');
  const projectDir = dirs[0];

  const id = store.nextAgentId.current++;

  const spawnable = attach
    ? attachCommand(attach.bgId)
    : process.platform === 'win32'
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
  agent.bgId = attach?.bgId;
  agent.bgName = attach?.name ?? resume?.bgName;
  if (resume || attach) {
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
    bgId: agent.bgId,
    bgName: agent.bgName,
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
    // A background session outlives its terminal: detached (← or /exit in
    // it) or the attach died, the session runs on — show it again.
    if (agent.bgId && !agent.bgLeaving && !runtime.resumableSessions?.isFrozen()) {
      if (store.has(id)) {
        runtime.unregisterAgent(agent.sessionId);
        runtime.closeAgent(id);
      }
      const record = runtime.resumableSessions?.list().find((s) => s.sessionId === sessionId);
      if (record) reattachLater(deps, record, options.bypassPermissions ?? false);
      return;
    }
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

/** Re-attach tries per session within a minute: past this a session that
 *  keeps detaching right away is left alone (it stays resumable). */
const REATTACH_MAX = 3;
const REATTACH_WINDOW_MS = 60_000;
const REATTACH_DELAY_MS = 800;
const reattaching = new Map<string, number[]>();

/** Show a background session again after its terminal went away on its own. */
function reattachLater(
  deps: LaunchStandaloneAgentDeps,
  record: ResumableSession,
  bypassPermissions: boolean,
): void {
  const key = record.bgId ?? record.sessionId;
  const now = Date.now();
  const recent = (reattaching.get(key) ?? []).filter((t) => now - t < REATTACH_WINDOW_MS);
  if (recent.length >= REATTACH_MAX) {
    console.warn(`[Pixel Agents] Background session ${key} keeps detaching: not attaching again`);
    return;
  }
  reattaching.set(key, [...recent, now]);
  setTimeout(
    () => void launchAgent(deps, { resume: record, bypassPermissions }),
    REATTACH_DELAY_MS,
  );
}

/** A launch's flags in background form (`--bg --name`, and `--resume <id>`
 *  for an existing conversation), with a supervisor's files when it is one. */
function backgroundLaunchArgs(
  provider: HookProvider,
  cwd: string,
  look: {
    name: string;
    sessionId?: string;
    bypassPermissions?: boolean;
    prompt?: string;
    model?: string;
    effort?: string;
    supervision?: SupervisionScope;
    /** A fresh supervisor: its files go under this id until Claude names it. */
    provisionalId?: string;
  },
): string[] | null {
  const resume = look.sessionId !== undefined;
  const filesId = look.sessionId ?? look.provisionalId;
  const launch = provider.buildLaunchCommand?.(look.sessionId ?? crypto.randomUUID(), cwd, {
    bypassPermissions: look.bypassPermissions,
    resume,
    prompt: look.prompt,
    model: look.model,
    effort: look.effort,
    extraArgs: launchExtras(filesId, look.supervision),
  });
  return launch ? backgroundArgs(launch.args, look.name) : null;
}

/** A first message cmd.exe would mangle (an npm .cmd shim): the regular path
 *  refuses it with a clear reason, so it goes there. */
function promptNeedsTerminal(prompt: string | undefined): boolean {
  if (!prompt || process.platform !== 'win32') return false;
  return runsThroughCmd(resolveWindowsCommand('claude', [])) && !isCmdSafeArgument(prompt);
}

/**
 * Launch an agent — as a Claude Code background session the office's
 * terminal attaches to, when that is on (Ajustes) — so closing or updating
 * the office leaves it running. Anything that does not fit (an untrusted
 * folder, `claude --bg` failing) launches it the regular way instead.
 */
export async function launchAgent(
  deps: LaunchStandaloneAgentDeps,
  options: LaunchStandaloneAgentOptions = {},
): Promise<number | null> {
  if (!backgroundAgentsOn() || !deps.ptyManager.isAvailable()) {
    return launchStandaloneAgent(deps, options);
  }
  const resume = options.resume;
  const cwd = resume?.cwd ?? options.directoryPath ?? process.cwd();
  try {
    if (resume?.bgId) {
      // Still there (running, done or stopped: attaching wakes it).
      const row = await findBackground(resume.bgId, cwd);
      if (row && row.sessionId === resume.sessionId) {
        return launchStandaloneAgent(deps, {
          ...options,
          attach: { bgId: row.id, sessionId: resume.sessionId, name: resume.bgName },
        });
      }
    }
    if (resume) {
      // A regular session (launched before this mode, or its background row
      // is gone): it becomes a background one under the same id.
      const name =
        resume.bgName ??
        backgroundName(resume.nickname ?? resume.directoryName ?? path.basename(cwd));
      const args = backgroundLaunchArgs(deps.provider, cwd, {
        name,
        sessionId: resume.sessionId,
        bypassPermissions: options.bypassPermissions,
        model: resume.model,
        effort: resume.effort,
        supervision: resume.supervision,
      });
      if (!args) return launchStandaloneAgent(deps, options);
      const started = await startBackground(cwd, args);
      if (started.sessionId !== resume.sessionId) {
        // Claude made a copy instead (the original already runs in the
        // background somewhere): drop the copy, resume the regular way.
        await stopBackground(started.bgId, cwd);
        return launchStandaloneAgent(deps, options);
      }
      return launchStandaloneAgent(deps, { ...options, attach: { ...started, name } });
    }
    if (promptNeedsTerminal(options.prompt)) return launchStandaloneAgent(deps, options);
    const name = backgroundName(options.nickname || path.basename(cwd));
    const provisionalId = options.supervision ? crypto.randomUUID() : undefined;
    const args = backgroundLaunchArgs(deps.provider, cwd, {
      name,
      bypassPermissions: options.bypassPermissions,
      prompt: options.prompt,
      model: options.model,
      effort: options.effort,
      supervision: options.supervision,
      provisionalId,
    });
    if (!args) return launchStandaloneAgent(deps, options);
    const started = await startBackground(cwd, args);
    if (provisionalId) supervisors().rebind(provisionalId, started.sessionId);
    return launchStandaloneAgent(deps, { ...options, attach: { ...started, name } });
  } catch (err) {
    const why = err instanceof WorkspaceNotTrustedError ? 'carpeta sin confianza' : String(err);
    console.warn(`[Pixel Agents] Background launch in ${cwd} failed (${why}): regular terminal`);
    return launchStandaloneAgent(deps, options);
  }
}

/**
 * Bring back the sessions whose terminals died with the previous server run
 * (shutdown or crash). A background session is attached again (it never
 * stopped); a regular one is relaunched with `--resume` (as a background
 * one when that mode is on). A folder that is gone drops its session; a
 * session Claude can no longer resume exits at once and drops itself.
 */
export async function resumeOfficeSessions(
  deps: LaunchStandaloneAgentDeps,
  bypassPermissions: boolean,
): Promise<number> {
  const sessions = deps.runtime.resumableSessions;
  if (!sessions || !deps.ptyManager.isAvailable()) return 0;
  const launches: Array<Promise<number | null>> = [];
  for (const session of sessions.list()) {
    if (!fs.existsSync(session.cwd)) {
      sessions.remove(session.sessionId);
      continue;
    }
    // A regular session's process can outlive a crashed server; a background
    // one is supposed to keep running, so it is never "orphaned".
    if (!session.bgId) {
      const orphans = killOrphanedSession(session.sessionId);
      if (orphans > 0) {
        console.log(
          `[Pixel Agents] Closed ${orphans} orphaned process(es) of ${session.sessionId}`,
        );
      }
    }
    launches.push(launchAgent(deps, { resume: session, bypassPermissions }));
  }
  return (await Promise.all(launches)).filter((id) => id !== null).length;
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
