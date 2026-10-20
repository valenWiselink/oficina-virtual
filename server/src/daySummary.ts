/**
 * "Escribirlo como resumen": today's achievements written by Claude as your
 * daily summary, only when you ask for it (it uses a little of your plan).
 * The data comes from the history the office already built (recap headlines,
 * PRs, completed tasks); Haiku only words it, with no tools, in an empty
 * folder and without keeping the session. The result is kept for the day in
 * ~/.pixel-agents/resumen-AAAA-MM-DD.json.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { DayAchievements, DayPr, DaySummary, PrState } from '../../core/src/messages.js';
import { agentEnv } from './terminal/ptySessionManager.js';
import { resolveWindowsCommand } from './terminal/windowsCommand.js';

/** Haiku answers in seconds; a stuck CLI must not hang the button forever. */
const SUMMARY_TIMEOUT_MS = 90_000;
/** What one day can hand the model (the client sends it: keep it bounded). */
const ITEMS_MAX = 60;
const TEXT_MAX = 400;

export const SUMMARY_ARGS = [
  '-p',
  '--model',
  'haiku',
  '--no-session-persistence',
  '--tools',
  '',
  '--output-format',
  'text',
];

export interface DayFacts {
  achievements: DayAchievements[];
  prs: DayPr[];
  tasks: string[];
}

export type SummaryRunner = (
  prompt: string,
) => Promise<{ code: number; out: string; err: string; timedOut: boolean }>;

const PR_STATES: readonly PrState[] = ['open', 'merged', 'closed'];

const clip = (s: unknown) =>
  (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '').slice(0, TEXT_MAX);

/** The facts a client sent, trimmed to plain bounded text (anything else dropped). */
export function cleanFacts(msg: Record<string, unknown>): DayFacts {
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, ITEMS_MAX) : []);
  const achievements = list(msg.achievements).flatMap((a) => {
    const o = a as { project?: unknown; items?: unknown };
    const items = list(o?.items).map(clip).filter(Boolean);
    const project = clip(o?.project);
    return project && items.length > 0 ? [{ project, items }] : [];
  });
  const prs = list(msg.prs).flatMap((p): DayPr[] => {
    const o = p as { title?: unknown; state?: unknown };
    const title = clip(o?.title);
    const state = PR_STATES.find((st) => st === o?.state);
    return title ? [{ title, state }] : [];
  });
  const tasks = list(msg.tasks).map(clip).filter(Boolean);
  return { achievements, prs, tasks };
}

export function hasFacts(facts: DayFacts): boolean {
  return facts.achievements.length + facts.prs.length + facts.tasks.length > 0;
}

/** The prompt: the day's facts and how to word them. */
export function summaryPrompt(facts: DayFacts): string {
  const lines: string[] = [
    'Escribí el resumen de mi día de trabajo a partir de estos datos, que salen de lo que registraron mis agentes de programación hoy.',
    '',
    'Reglas:',
    '- Castellano rioplatense, en segunda persona, hablándome a mí ("Arreglaste…", "Mejoraste…", "Dejaste listo…").',
    '- Entre 3 y 7 viñetas con lo que se logró, agrupadas por proyecto: el nombre del proyecto en una línea y sus viñetas debajo, empezando con "- ".',
    '- Juntá lo que sea lo mismo y priorizá lo que tiene impacto (lo que quedó andando, publicado o mergeado).',
    '- Sin nombres de agentes ni números de PR o de ticket, salvo que hagan falta para entender.',
    '- Nada de lo que quedó pendiente ni de lo que me toca hacer a mí ("Te toca", "Falta…").',
    '- No inventes nada que no esté en los datos. Si algo no está claro, dejalo afuera.',
    '- Devolvé sólo el resumen: sin título, sin introducción y sin cierre.',
    '',
    'Datos de hoy:',
  ];
  for (const a of facts.achievements) {
    lines.push('', `Proyecto ${a.project}:`, ...a.items.map((i) => `- ${i}`));
  }
  const merged = facts.prs.filter((p) => p.state === 'merged');
  const open = facts.prs.filter((p) => p.state !== 'merged' && p.state !== 'closed');
  if (merged.length > 0) lines.push('', 'PRs mergeados hoy:', ...merged.map((p) => `- ${p.title}`));
  if (open.length > 0) lines.push('', 'PRs abiertos hoy:', ...open.map((p) => `- ${p.title}`));
  if (facts.tasks.length > 0) {
    lines.push('', 'Tareas completadas:', ...facts.tasks.map((t) => `- ${t}`));
  }
  return `${lines.join('\n')}\n`;
}

/** `claude -p` with Haiku: prompt by stdin, an empty temporary folder as cwd
 *  (no project to read) and the agents' clean environment. */
const defaultRunner: SummaryRunner = (prompt) =>
  new Promise((resolve) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-resumen-'));
    const env = agentEnv(process.env);
    const spawnable =
      process.platform === 'win32'
        ? resolveWindowsCommand('claude', SUMMARY_ARGS, env)
        : { command: 'claude', args: SUMMARY_ARGS };
    const child = execFile(
      spawnable.command,
      spawnable.args,
      { cwd, env, timeout: SUMMARY_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        fs.rmSync(cwd, { recursive: true, force: true });
        const timedOut = !!err && (err as { killed?: boolean }).killed === true;
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, out: String(stdout ?? ''), err: String(stderr ?? ''), timedOut });
      },
    );
    child.stdin?.end(prompt);
  });

let runner: SummaryRunner = defaultRunner;
/** One summary at a time (two clicks, two offices). */
let writing = false;

/** Tests swap `claude -p` for a fake (it would spend the plan). */
export function setSummaryRunner(next: SummaryRunner | null): void {
  runner = next ?? defaultRunner;
}

/** Write today's summary and keep it; the reason when it could not. */
export async function writeDaySummary(
  facts: DayFacts,
  day: string,
  dir: string,
  now: () => number = Date.now,
): Promise<{ ok: true; summary: DaySummary } | { ok: false; reason: string }> {
  if (!hasFacts(facts))
    return { ok: false, reason: 'Todavía no hay nada logrado hoy para resumir' };
  if (writing) return { ok: false, reason: 'Ya lo está escribiendo' };
  writing = true;
  let result: Awaited<ReturnType<SummaryRunner>>;
  try {
    result = await runner(summaryPrompt(facts));
  } catch (err) {
    return { ok: false, reason: `No se pudo correr Claude: ${String(err)}` };
  } finally {
    writing = false;
  }
  if (result.timedOut) return { ok: false, reason: 'Claude tardó más de 90 segundos' };
  const text = result.out.trim();
  if (result.code !== 0 || !text) {
    const why = (result.err || result.out).trim().split('\n').pop()?.slice(0, 200);
    return { ok: false, reason: why ? `Claude no pudo: ${why}` : 'Claude no devolvió nada' };
  }
  const summary: DaySummary = { type: 'daySummary', day, text, at: now() };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(summaryFile(dir, day), JSON.stringify({ text, at: summary.at }));
  } catch (err) {
    // Shown anyway; it just will not survive a restart.
    console.warn(`[Pixel Agents] Could not save the day summary: ${String(err)}`);
  }
  return { ok: true, summary };
}

/** The summary kept for `day`, if one was written. */
export function savedDaySummary(dir: string, day: string): DaySummary | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(summaryFile(dir, day), 'utf-8')) as {
      text?: unknown;
      at?: unknown;
    };
    if (typeof raw.text !== 'string' || typeof raw.at !== 'number') return undefined;
    return { type: 'daySummary', day, text: raw.text, at: raw.at };
  } catch {
    return undefined;
  }
}

function summaryFile(dir: string, day: string): string {
  return path.join(dir, `resumen-${day}.json`);
}
