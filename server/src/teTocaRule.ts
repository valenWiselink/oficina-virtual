/**
 * The "Te toca" rule: what makes an agent close an answer with a line
 * `Te toca: …` when it leaves you something to do, which is what fills
 * "Te necesita" (agentIdentity.ts). instalar.ps1 offers to append it to
 * ~/.claude/CLAUDE.md; the .exe never ran that, so the office brings it
 * itself:
 *
 * - Agents the office launches get it with --append-system-prompt-file, no
 *   file of yours touched — unless your CLAUDE.md already has it (then twice
 *   would be noise). A supervisor does not: its role says when to write it,
 *   and Claude Code reads only one --append-system-prompt-file.
 * - Ajustes and the welcome can also append it to your global CLAUDE.md, for
 *   the sessions you open outside the office, and take back only that exact
 *   block (never text you wrote).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../../core/src/constants.js';
import type { TeTocaRuleStatus, TeTocaRuleWhere } from '../../core/src/messages.js';

/** Same text as instalar/regla-te-toca.md (a test keeps them equal). */
// eslint-disable-next-line pixel-agents/no-inline-colors -- "#812" is a PR number, not a colour.
export const TE_TOCA_RULE = `# Oficina virtual

Cuando termines un turno dejándome algo que tengo que hacer yo (mergear un PR,
probar algo, decidir, correr una migración, mandar un mensaje), cerrá la
respuesta con una línea propia que empiece con \`Te toca:\` y diga qué,
en pocas palabras. Ejemplo:

Te toca: mergear el PR #812 y avisarme

La oficina virtual lee esa línea para mostrarme el agente en "Te necesita".
Si no hay nada para mí (sólo un resumen, o vos seguís esperando algo), no la
pongas: escribirla sin motivo me hace creer que me necesitás.
`;

/** Where the rule sits in your CLAUDE.md: nowhere, the block the office (or
 *  instalar.ps1) added, or your own words (instalar.ps1's check: any
 *  "Te toca:", ignoring case). */
export type RuleInClaudeMd = TeTocaRuleWhere;

/** Your global CLAUDE.md (CLAUDE_CONFIG_DIR moves ~/.claude). */
export function claudeMdPath(): string {
  return path.join(
    process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'),
    'CLAUDE.md',
  );
}

/** The file's own line ending, so what is added or found matches it. */
const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');
const blockFor = (text: string) => TE_TOCA_RULE.replace(/\n/g, eolOf(text));

export function ruleIn(text: string | null): RuleInClaudeMd {
  if (!text || !/te toca:/i.test(text)) return 'none';
  return text.includes(blockFor(text)) ? 'office' : 'own';
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

export function ruleStatus(file = claudeMdPath()): RuleInClaudeMd {
  return ruleIn(read(file));
}

/** Append the block (after a blank line) unless the rule is already there. */
export function addRuleTo(file = claudeMdPath()): RuleInClaudeMd {
  const text = read(file) ?? '';
  if (ruleIn(text) !== 'none') return ruleIn(text);
  const eol = eolOf(text);
  const gap = text === '' ? '' : text.endsWith(eol) ? eol : eol + eol;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text + gap + blockFor(text));
  return 'office';
}

/** Take back the exact block it added (and the blank line before it); your
 *  own wording is never touched. */
export function removeRuleFrom(file = claudeMdPath()): RuleInClaudeMd {
  const text = read(file);
  if (text === null || ruleIn(text) !== 'office') return ruleIn(text);
  const eol = eolOf(text);
  const block = blockFor(text);
  const at = text.indexOf(block);
  let before = text.slice(0, at);
  if (before.endsWith(eol + eol)) before = before.slice(0, -eol.length);
  else if (before === eol) before = '';
  fs.writeFileSync(file, before + text.slice(at + block.length));
  return ruleIn(read(file));
}

/** Where the office keeps the rule it hands its agents: one stable path, as
 *  a background session keeps its flags and reads the file again on waking. */
export function ruleFilePath(dataDir = path.join(os.homedir(), SERVER_JSON_DIR)): string {
  return path.join(dataDir, 'regla-te-toca.md');
}

/**
 * The flags that give a plain office agent the rule: none when your
 * CLAUDE.md already has it (Claude Code loads that anyway). Each launch —
 * fresh, --resume, a relaunch for another model, --bg — builds its flags
 * anew, so the rule is there exactly once. Never throws: an agent without
 * the rule beats one that does not start.
 */
export function ruleLaunchArgs(claudeMd = claudeMdPath(), ruleFile = ruleFilePath()): string[] {
  if (ruleStatus(claudeMd) !== 'none') return [];
  try {
    if (read(ruleFile) !== TE_TOCA_RULE) {
      fs.mkdirSync(path.dirname(ruleFile), { recursive: true });
      fs.writeFileSync(ruleFile, TE_TOCA_RULE);
    }
    return ['--append-system-prompt-file', ruleFile];
  } catch (err) {
    console.error(`[Pixel Agents] Could not write the "Te toca" rule: ${String(err)}`);
    return [];
  }
}

/** The welcome's and Ajustes' switch: also in your global CLAUDE.md, or not.
 *  Answers with how it stands now (or why it could not). */
export function setRuleInClaudeMd(enabled: boolean, file = claudeMdPath()): TeTocaRuleStatus {
  try {
    const status = enabled ? addRuleTo(file) : removeRuleFrom(file);
    return { type: 'teTocaRuleStatus', status };
  } catch (err) {
    return {
      type: 'teTocaRuleStatus',
      status: ruleStatus(file),
      error: `No pude escribir ${file}: ${String(err)}`,
    };
  }
}
