/**
 * Jarvis is always there (asked for 2026-10-22): it starts with the office,
 * begins every day with a clean conversation that opens with its notebook,
 * and takes up a new role when an office update brings one. What it needs to
 * remember lives in `~/.pixel-agents/jarvis/estado.json`; the office does the
 * launching, closing and relaunching (cli.ts wires them).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runningBackground } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { SERVER_JSON_DIR } from '../constants.js';
import type { AgentState } from '../types.js';
import { jarvisPrompt, liveJarvis, type Notebook } from './jarvis.js';
import { roleHash } from './supervision.js';

/** What Jarvis's keeper remembers between runs. */
export interface JarvisState {
  /** Start Jarvis on its own (off once you close it; on when you call it). */
  auto?: boolean;
  /** The folder it ran in last: where it starts again. */
  folder?: string;
  /** Local date (AAAA-MM-DD) its current conversation belongs to. */
  day?: string;
}

/** Where it lives (resolved on use: tests move the home directory). */
const stateFile = () => path.join(os.homedir(), SERVER_JSON_DIR, 'jarvis', 'estado.json');

export function readJarvisState(file = stateFile()): JarvisState {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    return {
      auto: typeof raw.auto === 'boolean' ? raw.auto : undefined,
      folder: typeof raw.folder === 'string' ? raw.folder : undefined,
      day: typeof raw.day === 'string' ? raw.day : undefined,
    };
  } catch {
    return {};
  }
}

export function updateJarvisState(change: JarvisState, file = stateFile()): JarvisState {
  const next = { ...readJarvisState(file), ...change };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error(`[Pixel Agents] Could not save Jarvis's state: ${String(err)}`);
  }
  return next;
}

/** The day starts here: a new conversation, never before this hour. */
export const MORNING_HOUR = 6;
const TICK_MS = 5 * 60 * 1000;

/** Its first message in a conversation the office started. */
export function wakePrompt(reason: 'manana' | 'arranque'): string {
  const why =
    reason === 'manana'
      ? 'Empieza un día nuevo y esta es una conversación nueva.'
      : 'La oficina acaba de arrancar y esta es una conversación nueva.';
  return `${why} Leé tu bitácora con la herramienta bitacora para retomar lo pendiente y después contestá sólo «A su disposición, señor.».`;
}

export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface KeeperDeps {
  store: AgentStateStore;
  /** Its role when it was launched (supervisors().roleOf). */
  roleOf: (sessionId: string) => string | undefined;
  /** Open Jarvis (scope all) in a folder with a first message. */
  launch: (folder: string, prompt: string) => Promise<number | null>;
  /** Close it the way the office's ✕ does. */
  close: (id: number) => boolean;
  /** Relaunch the same conversation with fresh flags (its role rewritten). */
  relaunch: (id: number) => Promise<unknown>;
  /** A held permission waits on it. */
  hasPending: (agent: AgentState) => boolean;
  notebook?: Pick<Notebook, 'add'>;
  now?: () => Date;
  stateFile?: string;
}

export class JarvisKeeper {
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;

  constructor(private readonly deps: KeeperDeps) {}

  private get now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private state(): JarvisState {
    return readJarvisState(this.deps.stateFile);
  }

  private update(change: JarvisState): JarvisState {
    return updateJarvisState(change, this.deps.stateFile);
  }

  private jarvis(): [number, AgentState] | undefined {
    const id = liveJarvis(this.deps.store);
    const agent = id === undefined ? undefined : this.deps.store.get(id);
    return id === undefined || !agent ? undefined : [id, agent];
  }

  /** Quiet: between turns, nothing held, nothing running in the background. */
  private idle(agent: AgentState): boolean {
    return agent.isWaiting && !this.deps.hasPending(agent) && runningBackground(agent).length === 0;
  }

  private async wake(folder: string, reason: 'manana' | 'arranque'): Promise<boolean> {
    if (!fs.existsSync(folder)) return false;
    const id = await this.deps.launch(folder, wakePrompt(reason));
    if (id === null) return false;
    this.update({ day: localDay(this.now), folder });
    return true;
  }

  /** After the office resumed its sessions: an old role gets the new one;
   *  no Jarvis at all, and it starts on its own, starts it. */
  async onOfficeStart(): Promise<void> {
    const found = this.jarvis();
    const state = this.state();
    if (found) {
      const [id, agent] = found;
      if (agent.cwd && state.folder !== agent.cwd) this.update({ folder: agent.cwd });
      if (!state.day) this.update({ day: localDay(this.now) });
      if (this.deps.roleOf(agent.sessionId) !== roleHash(jarvisPrompt())) {
        this.deps.notebook?.add(
          'La oficina se actualizó: retomé esta conversación con mi rol nuevo.',
        );
        await this.deps.relaunch(id);
      }
      return;
    }
    if (state.auto !== false && state.folder) await this.wake(state.folder, 'arranque');
  }

  /** Every few minutes: remember where it works, and start each day clean. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.now;
      const today = localDay(now);
      const found = this.jarvis();
      const state = this.state();
      if (found?.[1].cwd && state.folder !== found[1].cwd) this.update({ folder: found[1].cwd });
      if (state.day === today || now.getHours() < MORNING_HOUR) return;
      if (!found) {
        if (state.auto !== false && state.folder) await this.wake(state.folder, 'manana');
        return;
      }
      // First day the keeper sees it: that conversation is today's.
      if (!state.day) {
        this.update({ day: today });
        return;
      }
      const [id, agent] = found;
      if (!this.idle(agent) || !agent.cwd) return;
      this.deps.notebook?.add('Día nuevo: cerré la conversación de ayer y empiezo una limpia.');
      if (!this.deps.close(id)) return;
      await this.wake(agent.cwd, 'manana');
    } finally {
      this.busy = false;
    }
  }

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** You called Jarvis (it will start on its own from now on), or closed it
 *  (it will not until you call it again). */
export function noteJarvisChoice(auto: boolean, folder?: string, file?: string): void {
  updateJarvisState(folder ? { auto, folder } : { auto }, file);
}
