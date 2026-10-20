/**
 * Does the Claude Code CLI answer on this machine? The first-run welcome asks,
 * because without it no agent can start and the terminal would only say
 * "claude is not recognized". Asked once per server run: installing it means
 * reopening the office anyway.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ClaudeStatus, TerminalLook } from '../../core/src/messages.js';

const CHECK_TIMEOUT_MS = 8000;

let cached: Promise<ClaudeStatus> | null = null;

export function claudeStatus(): Promise<ClaudeStatus> {
  cached ??= new Promise((resolve) => {
    // Through the shell on Windows: claude is a .cmd shim there.
    execFile(
      'claude',
      ['--version'],
      { timeout: CHECK_TIMEOUT_MS, shell: process.platform === 'win32', windowsHide: true },
      (err, stdout) => {
        const version = String(stdout ?? '').trim();
        resolve(
          err || !version
            ? { type: 'claudeStatus', installed: false }
            : { type: 'claudeStatus', installed: true, version },
        );
      },
    );
  });
  return cached;
}

/**
 * Which background Claude Code's theme is made for ("light", "light-ansi",
 * "dark-daltonized"…), read fresh on each connect since /theme can change it.
 * Unset or unreadable: Claude Code's default, dark. The terminal follows it
 * so the TUI's colors read (dark text on the dark terminal did not, 2026-10-19).
 */
export async function claudeTheme(): Promise<TerminalLook> {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? os.homedir();
  try {
    const raw = await fs.promises.readFile(path.join(dir, '.claude.json'), 'utf-8');
    const { theme } = JSON.parse(raw) as { theme?: unknown };
    return typeof theme === 'string' && theme.startsWith('light') ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
