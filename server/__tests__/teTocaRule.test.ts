import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addRuleTo,
  removeRuleFrom,
  ruleIn,
  ruleLaunchArgs,
  ruleStatus,
  setRuleInClaudeMd,
  TE_TOCA_RULE,
} from '../src/teTocaRule.js';

/** Valentín's own wording (2026-10-21): it has the rule, not our block. */
// eslint-disable-next-line pixel-agents/no-inline-colors -- "#812" is a PR number, not a colour.
const OWN_RULE = `# Oficina virtual

Cuando termines un turno dejándome algo que tengo que hacer yo, cerrá la
respuesta con una línea propia que empiece con \`Te toca:\`. Ejemplo:

Te toca: mergear el PR #812 del webapp y avisarme
`;

let dir: string;
let claudeMd: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-tetoca-'));
  claudeMd = path.join(dir, '.claude', 'CLAUDE.md');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (text: string) => {
  fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
  fs.writeFileSync(claudeMd, text);
};
const read = () => fs.readFileSync(claudeMd, 'utf-8');

describe('the "Te toca" rule', () => {
  it('is the same text instalar.ps1 offers', () => {
    const offered = fs.readFileSync(
      path.join(__dirname, '..', '..', 'instalar', 'regla-te-toca.md'),
      'utf-8',
    );
    expect(TE_TOCA_RULE).toBe(offered.replace(/\r\n/g, '\n'));
  });

  it('tells apart nothing, our block and your own words (any case, like instalar.ps1)', () => {
    expect(ruleIn(null)).toBe('none');
    expect(ruleIn('# Mis reglas\n')).toBe('none');
    expect(ruleIn(`# Mías\n\n${TE_TOCA_RULE}`)).toBe('office');
    expect(ruleIn(OWN_RULE)).toBe('own');
    expect(ruleIn('cerrá con te toca: …')).toBe('own');
  });

  it('adds it after a blank line and takes it back leaving the file as it was', () => {
    // A file without a final line ending keeps the one added before the block.
    const cases: Array<[string, string]> = [
      ['# Mis reglas\n\nNo uses emojis.', '# Mis reglas\n\nNo uses emojis.\n'],
      ['# Mis reglas\n', '# Mis reglas\n'],
      ['', ''],
    ];
    for (const [original, after] of cases) {
      write(original);
      expect(addRuleTo(claudeMd)).toBe('office');
      expect(read()).toBe(original ? `${after}\n${TE_TOCA_RULE}` : TE_TOCA_RULE);
      expect(read().startsWith(original)).toBe(true);
      expect(addRuleTo(claudeMd)).toBe('office'); // never twice
      expect(read().split('Te toca: mergear').length).toBe(2);
      expect(removeRuleFrom(claudeMd)).toBe('none');
      expect(read()).toBe(after);
    }
  });

  it('keeps a CRLF file in CRLF, both ways', () => {
    const original = '# Mis reglas\r\n\r\nNo uses emojis.\r\n';
    write(original);
    addRuleTo(claudeMd);
    expect(read()).not.toMatch(/[^\r]\n/);
    expect(ruleStatus(claudeMd)).toBe('office');
    removeRuleFrom(claudeMd);
    expect(read()).toBe(original);
  });

  it('creates the file (and its folder) when there was none', () => {
    expect(ruleStatus(claudeMd)).toBe('none');
    expect(setRuleInClaudeMd(true, claudeMd)).toEqual({
      type: 'teTocaRuleStatus',
      status: 'office',
    });
    expect(read()).toBe(TE_TOCA_RULE);
  });

  it('never touches your own words', () => {
    write(OWN_RULE);
    expect(addRuleTo(claudeMd)).toBe('own');
    expect(removeRuleFrom(claudeMd)).toBe('own');
    expect(read()).toBe(OWN_RULE);
  });

  it('says why when it cannot write', () => {
    // A folder where the file should be: neither readable nor writable.
    fs.mkdirSync(claudeMd, { recursive: true });
    const answer = setRuleInClaudeMd(true, claudeMd);
    expect(answer.status).toBe('none');
    expect(answer.error).toMatch(/^No pude escribir/);
  });
});

describe('the rule for the agents the office launches', () => {
  it('is a flag to a file holding it, when your CLAUDE.md lacks it', () => {
    const ruleFile = path.join(dir, '.pixel-agents', 'regla-te-toca.md');
    expect(ruleLaunchArgs(claudeMd, ruleFile)).toEqual(['--append-system-prompt-file', ruleFile]);
    expect(fs.readFileSync(ruleFile, 'utf-8')).toBe(TE_TOCA_RULE);
  });

  it('is nothing when your CLAUDE.md has it, ours or yours', () => {
    const ruleFile = path.join(dir, '.pixel-agents', 'regla-te-toca.md');
    write(OWN_RULE);
    expect(ruleLaunchArgs(claudeMd, ruleFile)).toEqual([]);
    write(TE_TOCA_RULE);
    expect(ruleLaunchArgs(claudeMd, ruleFile)).toEqual([]);
    expect(fs.existsSync(ruleFile)).toBe(false);
  });
});
