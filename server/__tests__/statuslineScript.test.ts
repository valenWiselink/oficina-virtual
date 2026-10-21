import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The built script (npm run build / node esbuild.js), as Claude Code runs it. */
const SCRIPT = path.join(__dirname, '../../dist/hooks/statusline.js');

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-script-'));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function run(stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.on('error', reject);
    child.on('exit', () => resolve(out));
    child.stdin.end(stdin);
  });
}

const limitsFile = () => path.join(home, '.pixel-agents', 'limites.json');
const inHours = (h: number) => Math.round(Date.now() / 1000 + h * 3600);

describe('statusline script', () => {
  it('saves the limits for the office and prints them', async () => {
    const input = {
      session_id: 's1',
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: inHours(2) },
        seven_day: { used_percentage: 41.2, resets_at: inHours(50) },
      },
    };
    // With the BOM a PowerShell pipe adds.
    expect(await run(`﻿${JSON.stringify(input)}\r\n`)).toBe('5 h: 24 % · semana: 41 %');
    const saved = JSON.parse(fs.readFileSync(limitsFile(), 'utf-8'));
    expect(saved.fiveHour).toEqual({ usedPercentage: 23.5, resetsAt: inHours(2) });
    expect(saved.sevenDay.usedPercentage).toBe(41.2);
    expect(Math.abs(saved.observedAt - Date.now())).toBeLessThan(10_000);
  });

  it('a session without limits prints what another one saved, and writes nothing', async () => {
    fs.mkdirSync(path.dirname(limitsFile()), { recursive: true });
    const saved = { observedAt: 1, sevenDay: { usedPercentage: 9, resetsAt: inHours(10) } };
    fs.writeFileSync(limitsFile(), JSON.stringify(saved));
    expect(await run(JSON.stringify({ model: { display_name: 'Opus' } }))).toBe('semana: 9 %');
    expect(JSON.parse(fs.readFileSync(limitsFile(), 'utf-8'))).toEqual(saved);
  });

  it('stays quiet on garbage', async () => {
    expect(await run('not json')).toBe('');
    expect(fs.existsSync(limitsFile())).toBe(false);
  });
});
