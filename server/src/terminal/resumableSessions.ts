import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';
import type { SupervisionScope } from '../supervisors/supervision.js';

/** One Claude session the office launched and still owns. */
export interface ResumableSession {
  sessionId: string;
  cwd: string;
  directoryName?: string;
  nickname?: string;
  palette?: number;
  hueShift?: number;
  /** Chosen in the office (--model / --effort); kept for every relaunch. */
  model?: string;
  effort?: string;
  /** A supervisor: what it watches over (relaunched with its MCP and role). */
  supervision?: SupervisionScope;
}

const FILE_NAME = 'oficina-sesiones.json';

function isResumableSession(value: unknown): value is ResumableSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sessionId === 'string' && typeof v.cwd === 'string';
}

/**
 * The sessions the office's terminals were running, kept on disk so they
 * survive the office itself. PTYs die with the server; the Claude sessions do
 * not have to — on the next start each one is relaunched with `--resume`.
 *
 * A session leaves the list only when it ends on its own terms: the user
 * closed the agent, or Claude exited. The server going down (shutdown or
 * crash) must not count as either, so shutdown freezes the list first.
 */
export class ResumableSessions {
  private frozen = false;

  constructor(private readonly filePath = path.join(os.homedir(), SERVER_JSON_DIR, FILE_NAME)) {}

  list(): ResumableSession[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isResumableSession) : [];
    } catch {
      return [];
    }
  }

  add(session: ResumableSession): void {
    if (this.frozen) return;
    this.write([...this.list().filter((s) => s.sessionId !== session.sessionId), session]);
  }

  remove(sessionId: string): void {
    if (this.frozen) return;
    this.write(this.list().filter((s) => s.sessionId !== sessionId));
  }

  /** Server going down: the terminals about to die must stay resumable. */
  freeze(): void {
    this.frozen = true;
  }

  private write(sessions: ResumableSession[]): void {
    const text = JSON.stringify(sessions, null, 2);
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, text);
      try {
        fs.renameSync(tmp, this.filePath);
      } catch {
        // Windows: rename over a file another process holds open fails with
        // EPERM. A direct write is not atomic, but losing the list is worse.
        fs.writeFileSync(this.filePath, text);
        fs.rmSync(tmp, { force: true });
      }
    } catch (err) {
      console.error(`[Pixel Agents] Could not save resumable sessions: ${String(err)}`);
    }
  }
}
