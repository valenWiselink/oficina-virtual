/**
 * Names and colours chosen in the office ("Editar") for agents it did not
 * launch, per Claude session, in ~/.pixel-agents/oficina-apariencias.json:
 * they survive the office restarting. Applied wherever an agent gets its
 * palette (paletteAssigner), so every creation path picks them up.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from './constants.js';
import type { AgentState } from './types.js';

/** A name and colour chosen for one session. nickname '' = cleared. */
export interface SavedLook {
  nickname?: string;
  palette?: number;
  hueShift?: number;
}

/** The per-session looks of agents the office does not own. */
export class AgentLooks {
  constructor(
    private readonly filePath = path.join(
      os.homedir(),
      SERVER_JSON_DIR,
      'oficina-apariencias.json',
    ),
  ) {}

  private read(): Record<string, SavedLook> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, SavedLook>) : {};
    } catch {
      return {};
    }
  }

  get(sessionId: string): SavedLook | undefined {
    return sessionId ? this.read()[sessionId] : undefined;
  }

  set(sessionId: string, look: SavedLook): void {
    if (!sessionId) return;
    const all = this.read();
    all[sessionId] = { ...all[sessionId], ...look };
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
    } catch (err) {
      console.error(`[Pixel Agents] Could not save agent looks: ${String(err)}`);
    }
  }
}

let looks: AgentLooks | null = null;
/** The store, created on first use (so tests can point HOME elsewhere first). */
export function agentLooks(): AgentLooks {
  looks ??= new AgentLooks();
  return looks;
}

/** Put a saved name and colour on an agent being created (no-op without one). */
export function applySavedLook(agent: AgentState, saved = agentLooks().get(agent.sessionId)): void {
  if (!saved) return;
  if (saved.nickname !== undefined) agent.nickname = saved.nickname || undefined;
  if (saved.palette !== undefined) {
    agent.palette = saved.palette;
    agent.hueShift = saved.hueShift ?? 0;
  }
}
