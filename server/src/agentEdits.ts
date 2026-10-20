/**
 * Editing an agent from the office ("Editar"): its name and colour for any
 * agent, and the model and effort for one in an office terminal. Names and
 * colours of agents the office did not launch are kept per session in
 * ~/.pixel-agents/oficina-apariencias.json, so they survive the office
 * restarting (agentLooks.ts; office terminals keep theirs in the
 * resumable-session list).
 */

import * as fs from 'fs';

import { identityMessage } from './agentIdentity.js';
import { type AgentLooks, agentLooks } from './agentLooks.js';
import type { AgentStateStore } from './agentStateStore.js';
import { PALETTE_COUNT } from './constants.js';
import { type SupervisionScope, supervisors } from './supervisors/supervision.js';
import { findLiveSession } from './terminal/adoptSession.js';
import { findBackground, stopBackground } from './terminal/backgroundSessions.js';
import type { ResumableSession, ResumableSessions } from './terminal/resumableSessions.js';
import { launchAgent, type LaunchStandaloneAgentDeps } from './terminal/standaloneAgentLauncher.js';
import { killOrphanedSession } from './terminal/windowsCommand.js';
import type { AgentState } from './types.js';

export const MODEL_ALIASES = ['opus', 'sonnet', 'haiku', 'fable'] as const;
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const NICKNAME_MAX = 32;
/** How long a terminal gets to close before the relaunch gives up waiting. */
const EXIT_WAIT_MS = 4_000;

/** A model Claude Code takes for --model: an alias or a full "claude-…" id. */
export function cleanModel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if ((MODEL_ALIASES as readonly string[]).includes(v)) return v;
  return /^claude-[a-z0-9.-]{1,60}(\[1m\])?$/.test(v) ? v : undefined;
}

/** An effort level Claude Code takes for --effort. */
export function cleanEffort(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  return (EFFORT_LEVELS as readonly string[]).includes(v) ? v : undefined;
}

/** The --model / --effort flags for a launch (none for "como siempre"). */
export function runFlags(model?: string, effort?: string): string[] {
  const flags: string[] = [];
  const m = cleanModel(model);
  const e = cleanEffort(effort);
  if (m) flags.push('--model', m);
  if (e) flags.push('--effort', e);
  return flags;
}

/** What editAgent asked for, validated: undefined fields stay as they are. */
export function parseEdit(msg: Record<string, unknown>): { nickname?: string; palette?: number } {
  const edit: { nickname?: string; palette?: number } = {};
  if (typeof msg.nickname === 'string') edit.nickname = msg.nickname.trim().slice(0, NICKNAME_MAX);
  if (
    Number.isInteger(msg.palette) &&
    (msg.palette as number) >= 0 &&
    (msg.palette as number) < PALETTE_COUNT
  ) {
    edit.palette = msg.palette as number;
  }
  return edit;
}

/**
 * Rename and/or recolour an agent, keep it, and tell every office. Returns
 * false when there was nothing to change.
 */
export function editAgent(
  store: AgentStateStore,
  resumable: ResumableSessions | undefined,
  id: number,
  msg: Record<string, unknown>,
  saved: AgentLooks = agentLooks(),
): boolean {
  const agent = store.get(id);
  if (!agent) return false;
  const edit = parseEdit(msg);
  if (edit.nickname === undefined && edit.palette === undefined) return false;

  if (edit.nickname !== undefined) agent.nickname = edit.nickname || undefined;
  if (edit.palette !== undefined) {
    agent.palette = edit.palette;
    agent.hueShift = 0;
  }

  const record = resumable?.list().find((s) => s.sessionId === agent.sessionId);
  if (record) {
    resumable!.add({
      ...record,
      nickname: agent.nickname,
      palette: agent.palette,
      hueShift: agent.hueShift,
    });
  } else {
    saved.set(agent.sessionId, {
      ...(edit.nickname !== undefined ? { nickname: edit.nickname } : {}),
      ...(edit.palette !== undefined ? { palette: edit.palette, hueShift: 0 } : {}),
    });
  }
  store.persist();

  store.broadcast(identityMessage(id, agent));
  if (edit.palette !== undefined) {
    store.broadcast({ type: 'agentAppearance', id, palette: agent.palette, hueShift: 0 });
  }
  return true;
}

export type RunResult = { ok: true; newId: number } | { ok: false; reason: string };

/** Busy right now: in a turn (Claude's own registry says so, or a tool runs,
 *  or its background session says it is working). */
async function isWorking(agent: AgentState): Promise<boolean> {
  if (agent.activeToolIds.size > 0) return true;
  if (findLiveSession(agent.sessionId)?.status === 'busy') return true;
  if (!agent.bgId) return false;
  const row = await findBackground(agent.bgId, agent.cwd);
  return row?.state === 'working' || row?.status === 'busy';
}

/** Another model or effort for an agent in an office terminal (relaunch). */
export async function setAgentRun(
  deps: LaunchStandaloneAgentDeps,
  id: number,
  msg: Record<string, unknown>,
  bypassPermissions: boolean,
): Promise<RunResult> {
  const { store, ptyManager } = deps;
  const agent = store.get(id);
  if (!agent) return { ok: false, reason: 'Agente inválido' };
  const session = ptyManager.get(id);
  if (!session) {
    return { ok: false, reason: 'Sólo se cambia en los agentes con terminal de la oficina' };
  }
  // null, absent or '' = "como siempre"; anything else must be valid.
  const asked = (v: unknown) => v !== null && v !== undefined && v !== '';
  const model = asked(msg.model) ? cleanModel(msg.model) : undefined;
  if (asked(msg.model) && !model) return { ok: false, reason: 'Ese modelo no existe' };
  const effort = asked(msg.effort) ? cleanEffort(msg.effort) : undefined;
  if (asked(msg.effort) && !effort) return { ok: false, reason: 'Ese nivel de esfuerzo no existe' };
  return relaunch(deps, id, { model, effort }, bypassPermissions);
}

/**
 * Close an office terminal and resume the same session with its look plus
 * `change` (model, effort, supervision). Refused while the agent is working.
 * Not `/model` inside the session: that also changes the user's default
 * for every new session.
 */
export async function relaunch(
  deps: LaunchStandaloneAgentDeps,
  id: number,
  change: Partial<Pick<ResumableSession, 'model' | 'effort' | 'supervision'>>,
  bypassPermissions: boolean,
): Promise<RunResult> {
  const { store, runtime, ptyManager } = deps;
  const agent = store.get(id);
  const session = ptyManager.get(id);
  if (!agent || !session) {
    return { ok: false, reason: 'Sólo se cambia en los agentes con terminal de la oficina' };
  }
  if (await isWorking(agent)) {
    return { ok: false, reason: 'Está trabajando: esperá a que termine su turno y probá de nuevo' };
  }
  if (!agent.cwd) return { ok: false, reason: 'No sé en qué carpeta trabaja' };

  const record = runtime.resumableSessions?.list().find((s) => s.sessionId === agent.sessionId);
  const look: ResumableSession = {
    ...(record ?? {
      sessionId: agent.sessionId,
      cwd: agent.cwd,
      model: agent.runModel,
      effort: agent.runEffort,
      supervision: agent.supervision,
    }),
    directoryName: agent.directoryName,
    nickname: agent.nickname,
    palette: agent.palette,
    hueShift: agent.hueShift,
    ...change,
  };

  // A background session that never got a message has no conversation on
  // disk to resume: it can be started again with new flags, but not made a
  // supervisor of anything yet.
  const hasConversation = fs.existsSync(agent.jsonlFile);
  if (agent.bgId && !hasConversation && change.supervision) {
    return { ok: false, reason: 'Mandale un primer mensaje antes de hacerlo supervisor' };
  }

  // Close its terminal and wait for it (its exit handler drops the old copy
  // from the store and the resumable list), then resume the same session.
  // A background session is stopped and taken off Claude Code's list first:
  // resumed again with other flags it keeps its id (a running one would be
  // copied instead).
  agent.bgLeaving = true;
  const exited = new Promise<void>((resolve) => {
    if (session.hasExited) resolve();
    else session.onExit(() => resolve());
    setTimeout(resolve, EXIT_WAIT_MS);
  });
  ptyManager.dispose(id);
  await exited;
  if (agent.bgId) await stopBackground(agent.bgId, agent.cwd);
  else killOrphanedSession(agent.sessionId);
  if (store.has(id)) runtime.closeAgent(id);

  const plain: ResumableSession = { ...look, bgId: undefined };
  const newId =
    agent.bgId && !hasConversation
      ? await launchAgent(deps, {
          directoryPath: look.cwd,
          nickname: look.nickname,
          palette: look.palette,
          hueShift: look.hueShift,
          model: look.model,
          effort: look.effort,
          bypassPermissions,
        })
      : await launchAgent(deps, { resume: plain, bypassPermissions });
  return newId === null
    ? { ok: false, reason: 'No se pudo retomar la sesión' }
    : { ok: true, newId };
}

/**
 * Make an office agent a supervisor, change what it watches over, or make it a
 * plain agent again (scope null): it is relaunched with (or without) its MCP
 * and role. Its token and files are dropped when it stops supervising.
 */
export async function setSupervision(
  deps: LaunchStandaloneAgentDeps,
  id: number,
  scope: SupervisionScope | null,
  bypassPermissions: boolean,
): Promise<RunResult> {
  const sessionId = deps.store.get(id)?.sessionId;
  const result = await relaunch(deps, id, { supervision: scope ?? undefined }, bypassPermissions);
  if (result.ok && !scope && sessionId) {
    supervisors().forget(sessionId);
    supervisors().teams.remove(sessionId);
  }
  return result;
}
