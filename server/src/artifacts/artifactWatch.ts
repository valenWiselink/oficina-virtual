import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { ArtifactsList } from '../../../core/src/messages.js';
import { SERVER_JSON_DIR } from '../constants.js';
import {
  absorbRecord,
  type ArtifactIndex,
  emptyIndex,
  type PendingCalls,
  refreshAgentNames,
  visibleArtifacts,
} from './artifactIndex.js';
import { listTranscripts, readNewLines } from './transcriptLines.js';

export const ARTIFACTS_POLL_MS = 15_000;
const SAVE_EVERY_MS = 60_000;
/** A first read finds many: the page gets them in batches. */
const BROADCAST_EVERY_MS = 2_000;
/** Calls that never got an answer (a session killed mid-call) are not kept for ever. */
const PENDING_MAX = 50;

export const ARTIFACTS_FILE = 'artifacts.json';

interface FileProgress {
  offset: number;
  pending?: PendingCalls;
}

interface SavedState extends ArtifactIndex {
  version: 1;
  files: Record<string, FileProgress>;
  /** Every transcript was read once: from here on only what is new is left. */
  caughtUp: boolean;
}

interface ArtifactWatchDeps {
  broadcast: (message: ArtifactsList) => void;
  /** Where Claude Code keeps its transcripts. */
  roots: () => string[];
  /** The name the office gave a session, which beats its title. */
  nameOf?: (sessionId: string) => string | undefined;
  file?: string;
  now?: () => number;
}

function loadState(file: string): SavedState {
  const blank: SavedState = { ...emptyIndex(), version: 1, files: {}, caughtUp: false };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<SavedState>;
    return saved.version === 1 && saved.artifacts && saved.files ? { ...blank, ...saved } : blank;
  } catch {
    // None yet or damaged: the transcripts still have it (those not cleaned up).
    return blank;
  }
}

/**
 * The artifacts your agents published, found in their transcripts: no one sets
 * anything up, and a new agent counts from its first publish. Kept in
 * ~/.pixel-agents/artifacts.json, so a closed agent, a restart or Claude Code
 * cleaning old transcripts lose nothing. Reads local files only; what it knows
 * goes to tokened pages and nowhere else, and it never contacts claude.ai.
 */
export class ArtifactWatch {
  private readonly file: string;
  private readonly now: () => number;
  private state: SavedState;
  private clients = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  /** The list changed: save it right away, unlike mere progress in a file. */
  private listDirty = false;
  private progressDirty = false;
  private lastSave = 0;
  private lastBroadcast = 0;
  private lastSent = '';

  constructor(private readonly deps: ArtifactWatchDeps) {
    this.file = deps.file ?? path.join(os.homedir(), SERVER_JSON_DIR, ARTIFACTS_FILE);
    this.now = deps.now ?? Date.now;
    this.state = loadState(this.file);
    this.lastSent = JSON.stringify(this.message());
  }

  message(): ArtifactsList {
    return {
      type: 'artifactsList',
      artifacts: visibleArtifacts(this.state),
      scanning: !this.state.caughtUp,
    };
  }

  clientJoined(): void {
    this.clients += 1;
    if (this.clients === 1) this.schedule(0);
  }

  clientLeft(): void {
    this.clients = Math.max(0, this.clients - 1);
    if (this.clients === 0) this.clearTimer();
  }

  stop(): void {
    this.stopped = true;
    this.clients = 0;
    this.clearTimer();
    this.saveNow();
  }

  /** One pass over what grew since the last one. */
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const seen = new Set<string>();
      for (const root of this.deps.roots()) {
        for (const { file, size } of await listTranscripts(root)) {
          if (this.stopped) return;
          seen.add(file);
          await this.readFile(file, size);
          this.maybeBroadcast();
          await this.maybeSave();
        }
      }
      this.forgetGoneFiles(seen);
      if (!this.state.caughtUp) {
        this.state.caughtUp = true;
        this.listDirty = true;
      }
      if (refreshAgentNames(this.state, this.deps.nameOf)) this.listDirty = true;
      this.sendIfChanged();
      await this.maybeSave();
    } finally {
      this.running = false;
      if (this.clients > 0 && !this.stopped) this.schedule(ARTIFACTS_POLL_MS);
    }
  }

  private async readFile(file: string, size: number): Promise<void> {
    const known = this.state.files[file];
    if (known && known.offset === size) return;
    // Shorter than what was read: it was rewritten, read it again.
    const from = known && known.offset <= size ? known.offset : 0;
    const pending: PendingCalls = from > 0 ? { ...known?.pending } : {};
    const stem = path.basename(file, '.jsonl');
    let offset: number;
    try {
      offset = await readNewLines(file, from, (line) => {
        let record: Record<string, unknown>;
        try {
          record = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        if (absorbRecord(this.state, record, pending, stem)) this.listDirty = true;
      });
    } catch {
      return; // Gone or locked: it stays as it was until the next pass.
    }
    const open = Object.entries(pending).slice(-PENDING_MAX);
    this.state.files[file] = {
      offset,
      ...(open.length ? { pending: Object.fromEntries(open) } : {}),
    };
    this.progressDirty = true;
  }

  private forgetGoneFiles(seen: Set<string>): void {
    for (const file of Object.keys(this.state.files)) {
      if (seen.has(file)) continue;
      delete this.state.files[file];
      this.progressDirty = true;
    }
    const stems = new Set([...seen].map((f) => path.basename(f, '.jsonl')));
    const named = new Set(Object.values(this.state.artifacts).map((a) => a.sessionId));
    for (const sessionId of Object.keys(this.state.titles)) {
      if (!stems.has(sessionId) && !named.has(sessionId)) delete this.state.titles[sessionId];
    }
  }

  private maybeBroadcast(): void {
    if (!this.listDirty || this.now() - this.lastBroadcast < BROADCAST_EVERY_MS) return;
    refreshAgentNames(this.state, this.deps.nameOf);
    this.sendIfChanged();
  }

  private sendIfChanged(): void {
    const message = this.message();
    const serialized = JSON.stringify(message);
    if (serialized === this.lastSent) return;
    this.lastSent = serialized;
    this.lastBroadcast = this.now();
    this.deps.broadcast(message);
  }

  private async maybeSave(): Promise<void> {
    const due = this.now() - this.lastSave >= SAVE_EVERY_MS;
    // During the first read the list changes all the time: progress pace will do.
    const listNow = this.listDirty && this.state.caughtUp;
    if (!listNow && !((this.listDirty || this.progressDirty) && due)) return;
    const json = this.takeSnapshot();
    const tmp = `${this.file}.tmp`;
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await fsp.writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 });
      await fsp.rename(tmp, this.file);
    } catch (err) {
      this.listDirty = true;
      console.warn(`[Pixel Agents] Could not save the artifacts index: ${String(err)}`);
    }
  }

  private saveNow(): void {
    if (!this.listDirty && !this.progressDirty) return;
    const json = this.takeSnapshot();
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, json, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn(`[Pixel Agents] Could not save the artifacts index: ${String(err)}`);
    }
  }

  private takeSnapshot(): string {
    this.listDirty = false;
    this.progressDirty = false;
    this.lastSave = this.now();
    return JSON.stringify(this.state);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.poll(), delay);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
