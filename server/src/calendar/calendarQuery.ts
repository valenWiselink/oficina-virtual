/**
 * Reads the user's Google Calendar through the claude.ai connector of their
 * Claude Code, with NO model turn, no credential of ours and no token spent.
 *
 * The connector only exists inside Claude Code, so a `claude -p` runs with an
 * `mcp_tool` hook (https://code.claude.com/docs/en/hooks) that calls
 * `list_events`; `--include-hook-events` puts the answer in the output stream.
 * A second hook then blocks the prompt, which ends the session before any
 * request to the model (measured with 2.1.318: `total_cost_usd` 0, 0 turns).
 * Hooks of one event run together and a block cancels the others, so that
 * second hook waits until the first has answered: this file creates the file
 * it waits for. It gives up by itself after a while and blocks anyway.
 *
 * Calendar text stays in memory: no session is saved, the temporary folder
 * holds no answer, and nothing here logs what the connector returned.
 * Only `list_events` is ever called: the office never writes to a calendar.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { agentEnv } from '../terminal/ptySessionManager.js';
import { resolveWindowsCommand } from '../terminal/windowsCommand.js';

/** The connector's name in Claude Code (`mcp_servers` of the session). */
const CALENDAR_SERVER = 'claude.ai Google Calendar';
const LOOK_BEHIND_MS = 12 * 3_600_000; // a long meeting that already started
const LOOK_AHEAD_MS = 7 * 24 * 3_600_000;
const PAGE_SIZE = 40;

const TOOL_TIMEOUT_S = 30;
const GUARD_GIVE_UP_MS = 35_000;
const GUARD_TIMEOUT_S = 40;
/** Claude's own start, its connectors, then the hooks. */
const QUERY_TIMEOUT_MS = 90_000;

const GUARD_REASON = 'oficina-calendario';
const GUARD_OUTPUT = JSON.stringify({ decision: 'block', reason: GUARD_REASON });
const RELEASE_FILE = 'listo';
const CALENDAR_CWD = 'oficina-calendario';

/**
 * `off`: the connector is not there (not connected, not logged in, no
 * `claude`). `retry`: it is there but this attempt failed.
 */
export type CalendarAnswer =
  | { kind: 'events'; events: unknown; modelUsed: boolean }
  | { kind: 'off' | 'retry'; modelUsed: boolean };

export type CalendarQuery = () => Promise<CalendarAnswer>;

/** What the connector takes: local time with no offset (its documented form). */
function localTime(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}` +
    `T${two(d.getHours())}:${two(d.getMinutes())}:00`
  );
}

export function calendarArgs(settingsFile: string): string[] {
  return [
    '-p',
    '--model',
    'haiku', // never reached; the cheapest if a future version let it through
    '--no-session-persistence',
    '--tools',
    '',
    // Only our hooks: the user's would report this run to the office as an agent.
    '--setting-sources',
    'local',
    '--settings',
    settingsFile,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-hook-events',
    '--max-budget-usd',
    '0.01',
  ];
}

/** The hooks of one run. `onFailure: block`: a timeout must not reach the model. */
export function calendarSettings(guardScript: string, now: number): Record<string, unknown> {
  return {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'mcp_tool',
              server: CALENDAR_SERVER,
              tool: 'list_events',
              input: {
                startTime: localTime(now - LOOK_BEHIND_MS),
                endTime: localTime(now + LOOK_AHEAD_MS),
                orderBy: 'startTime',
                pageSize: PAGE_SIZE,
              },
              timeout: TOOL_TIMEOUT_S,
              onFailure: 'block',
            },
            {
              type: 'command',
              command: process.execPath,
              args: [guardScript],
              timeout: GUARD_TIMEOUT_S,
              onFailure: 'block',
            },
          ],
        },
      ],
    },
  };
}

/** Holds the prompt until RELEASE_FILE appears beside it, then blocks it. */
export function guardSource(): string {
  return `const fs = require('fs');
const path = require('path');
const release = path.join(__dirname, ${JSON.stringify(RELEASE_FILE)});
const started = Date.now();
setInterval(() => {
  if (!fs.existsSync(release) && Date.now() - started < ${GUARD_GIVE_UP_MS}) return;
  process.stdout.write(${JSON.stringify(GUARD_OUTPUT)} + '\\n', () => process.exit(0));
}, 100);
`;
}

/** Reads a run's stream-json output, one line at a time. */
export class CalendarStream {
  /** The connector's text, once its hook answered successfully. */
  private text: string | null = null;
  private status: string | null = null;
  private modelUsed = false;

  /** Feeds a line; true the first time the connector's hook has answered. */
  push(line: string): boolean {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return false;
    }
    if (event.type === 'result') {
      this.modelUsed = Number(event.total_cost_usd) > 0 || Number(event.num_turns) > 0;
      return false;
    }
    if (event.type !== 'system') return false;
    if (event.subtype === 'init') {
      const servers = Array.isArray(event.mcp_servers)
        ? (event.mcp_servers as Array<{ name?: unknown; status?: unknown }>)
        : [];
      const mine = servers.find((s) => s.name === CALENDAR_SERVER);
      this.status = typeof mine?.status === 'string' ? mine.status : 'absent';
      return false;
    }
    if (event.subtype !== 'hook_response' || event.outcome === 'cancelled') return false;
    const output = typeof event.output === 'string' ? event.output : '';
    if (output.trim() === GUARD_OUTPUT) return false;
    if (event.outcome === 'success') this.text = output;
    return true;
  }

  answer(): CalendarAnswer {
    const modelUsed = this.modelUsed;
    if (this.text !== null) {
      try {
        const body = JSON.parse(this.text) as { events?: unknown };
        if (Array.isArray(body?.events)) return { kind: 'events', events: body.events, modelUsed };
      } catch {
        // Not the connector's JSON: same as a failed attempt.
      }
    }
    // `pending`: still connecting when the hook ran. No init at all: Claude
    // Code could not start a session (not installed, not logged in).
    const there = this.status === 'connected' || this.status === 'pending';
    return { kind: there ? 'retry' : 'off', modelUsed };
  }
}

/** One real read of the connector. Never rejects: failing is an answer. */
export const queryCalendar: CalendarQuery = () =>
  new Promise((resolve) => {
    let folder: string | null = null;
    const finish = (answer: CalendarAnswer) => {
      if (folder) fs.rmSync(folder, { recursive: true, force: true });
      resolve(answer);
    };
    try {
      // One fixed cwd: Claude Code keeps a folder per cwd in ~/.claude/projects
      // even with no session saved (measured), so a new one per read would
      // leave hundreds a day. Each read's files go in a folder of its own.
      const cwd = path.join(os.tmpdir(), CALENDAR_CWD);
      fs.mkdirSync(cwd, { recursive: true });
      folder = fs.mkdtempSync(path.join(cwd, 'lectura-'));
      const run = folder;
      const guard = path.join(run, 'guard.cjs');
      const settingsFile = path.join(run, 'settings.json');
      fs.writeFileSync(guard, guardSource());
      fs.writeFileSync(settingsFile, JSON.stringify(calendarSettings(guard, Date.now())));

      const env = {
        ...agentEnv(process.env),
        // Wait for the connectors at start: the hook does not wait for them.
        MCP_CONNECTION_NONBLOCKING: '0',
        // The guard runs on our own runtime, which in the desktop app is
        // Electron (ignored by a plain Node).
        ELECTRON_RUN_AS_NODE: '1',
      };
      const args = calendarArgs(settingsFile);
      const spawnable =
        process.platform === 'win32'
          ? resolveWindowsCommand('claude', args, env)
          : { command: 'claude', args };
      const child = spawn(spawnable.command, spawnable.args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: QUERY_TIMEOUT_MS,
      });
      const stream = new CalendarStream();
      let pending = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (stream.push(line)) fs.writeFileSync(path.join(run, RELEASE_FILE), '');
        }
      });
      child.on('error', () => finish(stream.answer()));
      child.on('close', () => {
        stream.push(pending);
        finish(stream.answer());
      });
      child.stdin.on('error', () => {});
      child.stdin.end('oficina');
    } catch {
      finish({ kind: 'off', modelUsed: false });
    }
  });
