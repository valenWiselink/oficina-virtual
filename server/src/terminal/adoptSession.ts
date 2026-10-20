import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { LaunchStandaloneAgentDeps } from './standaloneAgentLauncher.js';
import { launchStandaloneAgent } from './standaloneAgentLauncher.js';

/** Claude Code's own registry of running sessions: ~/.claude/sessions/<pid>.json. */
interface LiveSession {
  pid: number;
  sessionId: string;
  cwd?: string;
  /** 'cli' = a terminal; 'claude-desktop' = the desktop app (never ours to take). */
  entrypoint?: string;
  /** 'idle' between turns, 'busy' while working. */
  status?: string;
}

/** How long to wait for the old process to exit before giving up. */
const EXIT_WAIT_MS = 5000;
const EXIT_POLL_MS = 100;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The running process of a session, from Claude Code's session registry. */
export function findLiveSession(
  sessionId: string,
  dir = path.join(os.homedir(), '.claude', 'sessions'),
): LiveSession | null {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as LiveSession;
      if (s.sessionId === sessionId && Number.isInteger(s.pid) && isAlive(s.pid)) return s;
    } catch {
      /* a registry file being rewritten: skip it */
    }
  }
  return null;
}

export type AdoptResult = { ok: true; newId: number } | { ok: false; reason: string };

/**
 * "Bring it into the office": a session running in someone else's terminal
 * (VS Code, a console) is closed there and resumed here with `--resume`, so
 * the office can type into it like into its own. Refuses what would hurt:
 * the desktop app's sessions, and a session in the middle of a turn.
 */
export async function adoptIntoOffice(
  deps: LaunchStandaloneAgentDeps,
  agentId: number,
  bypassPermissions: boolean,
): Promise<AdoptResult> {
  const { store, runtime, ptyManager } = deps;
  const agent = store.get(agentId);
  if (!agent || agent.leadAgentId !== undefined) return { ok: false, reason: 'Agente inválido' };
  if (ptyManager.has(agentId)) return { ok: false, reason: 'Ya está en la oficina' };

  const live = findLiveSession(agent.sessionId);
  if (live?.entrypoint && live.entrypoint !== 'cli') {
    return { ok: false, reason: 'Es una sesión de Claude Desktop: esa se queda en la app' };
  }
  if (live?.status === 'busy') {
    return { ok: false, reason: 'Está trabajando: esperá a que termine su turno y probá de nuevo' };
  }
  const cwd = live?.cwd ?? agent.cwd;
  if (!cwd) return { ok: false, reason: 'No sé en qué carpeta trabaja esa sesión' };

  if (live) {
    try {
      process.kill(live.pid);
    } catch {
      /* already gone */
    }
    for (let waited = 0; isAlive(live.pid); waited += EXIT_POLL_MS) {
      if (waited >= EXIT_WAIT_MS) return { ok: false, reason: 'La sesión no se cerró a tiempo' };
      await new Promise((resolve) => setTimeout(resolve, EXIT_POLL_MS));
    }
  }

  const look = {
    sessionId: agent.sessionId,
    cwd,
    nickname: agent.nickname,
    directoryName: agent.directoryName,
    palette: agent.palette,
    hueShift: agent.hueShift,
  };
  // The observed copy goes; the office's own terminal takes its place.
  runtime.closeAgent(agentId);
  const newId = launchStandaloneAgent(deps, { resume: look, bypassPermissions });
  return newId === null
    ? { ok: false, reason: 'No se pudo retomar la sesión en la oficina' }
    : { ok: true, newId };
}
