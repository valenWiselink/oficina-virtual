import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  setSpanishTerminal,
  SPINNER_TIPS,
  SPINNER_VERBS,
  spinnerLaunchArgs,
  spinnerSettings,
} from '../src/spinnerSettings.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-spinner-'));
  file = path.join(dir, '.pixel-agents', 'claude-en-castellano.json');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const read = () => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;

describe('spinnerSettings', () => {
  it('replaces the verbs and the tips, in the shapes the settings reference documents', () => {
    const s = spinnerSettings() as {
      spinnerVerbs: { mode: string; verbs: string[] };
      spinnerTipsOverride: {
        label: string;
        excludeDefault: boolean;
        tips: Array<{ id: string; text: string; cooldownSessions: number }>;
      };
    };
    expect(s.spinnerVerbs.mode).toBe('replace');
    expect(s.spinnerVerbs.verbs).toEqual(SPINNER_VERBS);
    expect(s.spinnerTipsOverride.label).toBe('Oficina');
    expect(s.spinnerTipsOverride.excludeDefault).toBe(true);
    for (const tip of s.spinnerTipsOverride.tips) {
      // id: up to 64 letters, digits, ".", "_" or "-"; text: one line, ≤ 500.
      expect(tip.id).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
      expect(tip.text.length).toBeLessThanOrEqual(500);
      expect(tip.text).not.toMatch(/\n/);
      expect(tip.cooldownSessions).toBe(5);
    }
    expect(new Set(SPINNER_TIPS.map((t) => t.id)).size).toBe(SPINNER_TIPS.length);
  });

  it('keeps about thirty verbs, none repeated, gerunds without the dots Claude Code adds', () => {
    expect(SPINNER_VERBS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SPINNER_VERBS).size).toBe(SPINNER_VERBS.length);
    for (const verb of SPINNER_VERBS) {
      expect(verb).toMatch(/^[A-ZÁÉÍÓÚ][a-záéíóúñ ]+$/);
      expect(verb.split(' ')[0]).toMatch(/[aeáé]ndo(le)?$/);
    }
  });

  it('writes the file and hands --settings while on', () => {
    expect(spinnerLaunchArgs(file, true)).toEqual(['--settings', file]);
    expect(read()).toEqual(spinnerSettings());
  });

  it('hands nothing while off', () => {
    expect(spinnerLaunchArgs(file, false)).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('empties the file when switched off, never deletes it (a waking session still reads it)', () => {
    setSpanishTerminal(true, file);
    expect(read()).toEqual(spinnerSettings());
    setSpanishTerminal(false, file);
    expect(read()).toEqual({});
    setSpanishTerminal(true, file);
    expect(read()).toEqual(spinnerSettings());
  });

  it('launches without the flag when the file cannot be written', () => {
    // A directory where the file should be: writing it fails.
    fs.mkdirSync(file, { recursive: true });
    expect(spinnerLaunchArgs(file, true)).toEqual([]);
  });
});
