import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';
import { LIMITS_FILE_NAME, type LimitsSnapshot, parseLimitsSnapshot } from './rateLimits.js';
import {
  installStatusLine,
  type StatusLineSetup,
  statusLineSetup,
  uninstallStatusLine,
  writeStatusLineFiles,
} from './statusLineInstaller.js';

/** How often the limits file is checked (a stat; the status line writes it
 *  after each response of any session). */
const FILE_POLL_MS = 5_000;
/** How often settings.json is re-read, in case the status line was changed
 *  by hand or by Claude Code's /statusline. */
const SETUP_POLL_MS = 60_000;

/** What the offices get (`usageLimits`). */
export interface UsageLimitsMessage extends Partial<LimitsSnapshot> {
  type: 'usageLimits';
  setup: StatusLineSetup;
  /** Why turning the limits on or off failed, for the office that asked. */
  error?: string;
}

interface UsageLimitsWatchDeps {
  broadcast: (message: UsageLimitsMessage) => void;
  /** Where dist/hooks/statusline.js ships. */
  packageRoot: string;
  /** The limits file (tests); defaults to ~/.pixel-agents/limites.json. */
  file?: string;
}

/**
 * The plan's usage limits for the offices: watches the file the office's
 * status line writes and whether that status line is installed, and turns it
 * on and off when the user asks.
 */
export class UsageLimitsWatch {
  private readonly file: string;
  private setup: StatusLineSetup = 'unknown';
  private snapshot: LimitsSnapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onFileChange = () => this.refresh();

  constructor(private readonly deps: UsageLimitsWatchDeps) {
    this.file = deps.file ?? path.join(os.homedir(), SERVER_JSON_DIR, LIMITS_FILE_NAME);
  }

  start(): void {
    this.setup = statusLineSetup();
    // An update may bring a new script, or the runtime may have moved.
    if (this.setup === 'ours') writeStatusLineFiles(this.deps.packageRoot);
    this.snapshot = this.readFile();
    fs.watchFile(this.file, { interval: FILE_POLL_MS, persistent: false }, this.onFileChange);
    this.timer = setInterval(() => this.refresh(), SETUP_POLL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    fs.unwatchFile(this.file, this.onFileChange);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  message(): UsageLimitsMessage {
    return { type: 'usageLimits', setup: this.setup, ...(this.snapshot ?? {}) };
  }

  /** Turn the status line on or off. Resolves with the reason it failed, or
   *  null; every office hears the new state either way. */
  async setEnabled(on: boolean): Promise<string | null> {
    let error: string | null = null;
    try {
      if (!on) await uninstallStatusLine();
      else if (!writeStatusLineFiles(this.deps.packageRoot))
        error = 'No encontré el programa de la barra de estado';
      else await installStatusLine();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    this.setup = statusLineSetup();
    // The installer speaks English; an unreadable file is the one case worth
    // saying in the office's words.
    if (error && this.setup === 'unknown') error = 'No pude leer tu ~/.claude/settings.json';
    this.deps.broadcast(this.message());
    return error;
  }

  /** Re-read both sources; broadcast only when something changed. */
  refresh(): void {
    const before = JSON.stringify(this.message());
    this.setup = statusLineSetup();
    this.snapshot = this.readFile();
    const after = this.message();
    if (JSON.stringify(after) !== before) this.deps.broadcast(after);
  }

  private readFile(): LimitsSnapshot | null {
    try {
      return parseLimitsSnapshot(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      return null;
    }
  }
}
