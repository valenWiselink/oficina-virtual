import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../../../../constants.js';
import {
  LIMITS_FILE_NAME,
  mergeLimits,
  parseLimitsSnapshot,
  rateLimitsFromStatusLine,
  statusLineText,
} from '../../../../usageLimits/rateLimits.js';

/**
 * Claude Code's status line command (installed only when the user turns the
 * limits on in the office). Claude Code pipes the session's JSON on stdin
 * after each response; this keeps the plan's limits in
 * ~/.pixel-agents/limites.json for the office and prints them as the status
 * line. Never fails loudly: a status line that errors just stays blank.
 */
const LIMITS_FILE = path.join(os.homedir(), SERVER_JSON_DIR, LIMITS_FILE_NAME);

function readSnapshot() {
  try {
    return parseLimitsSnapshot(fs.readFileSync(LIMITS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/** Write via tmp + rename so the office never reads half a file. Several
 *  sessions may race; losing one report is fine (the next one repeats it). */
function writeSnapshot(content: string): void {
  const tmp = `${LIMITS_FILE}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(LIMITS_FILE), { recursive: true });
    fs.writeFileSync(tmp, content, 'utf-8');
    fs.renameSync(tmp, LIMITS_FILE);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

function handle(raw: string): void {
  let input: unknown;
  try {
    // A pipe from PowerShell starts with a BOM.
    input = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    return;
  }
  const report = rateLimitsFromStatusLine(input);
  const prev = readSnapshot();
  const now = Date.now();
  const merged = report ? mergeLimits(prev, report, now) : prev;
  if (report && merged) writeSnapshot(JSON.stringify(merged));
  if (merged) process.stdout.write(statusLineText(merged, now));
}

let data = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => (data += chunk));
process.stdin.on('end', () => handle(data));
