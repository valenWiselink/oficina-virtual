/**
 * The background reviewer of «Te toca» (asked 2026-11-19): every few minutes,
 * and only when something was said since its last look, Haiku compares each
 * open ask with what happened after it in the conversations (Jarvis, the
 * agents, Valentín) and closes what clearly is done or no longer needed,
 * leaving its reason; the page offers «Deshacer».
 *
 * Cheap on purpose: the clock only checks two numbers; a `claude -p` (no
 * tools, no session kept, an empty folder, none of the user's hooks) runs at
 * most once every REVIEW_EVERY_MS and never when nothing new was said. A
 * failure waits a long while before the next try.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { agentEnv } from '../terminal/ptySessionManager.js';
import { resolveWindowsCommand } from '../terminal/windowsCommand.js';
import type { PendingAsks, StoredAsk } from './pendingAsks.js';

export const REVIEW_EVERY_MS = 5 * 60_000;
/** After a failed run (no Claude, no plan, a timeout). */
export const REVIEW_BACKOFF_MS = 30 * 60_000;
const REVIEW_TIMEOUT_MS = 90_000;
/** What the reviewer remembers of the conversations (in memory only). */
const LOG_KEPT = 120;
const LOG_TEXT_MAX = 600;
/** What one review hands the model, at most. */
const ASKS_MAX = 20;
const EVENTS_MAX = 40;
const PROMPT_EVENTS_CHARS = 14_000;

export const REVIEW_ARGS = [
  '-p',
  '--model',
  'haiku',
  '--no-session-persistence',
  '--tools',
  '',
  // None of the user's hooks: they would report this run to the office as an agent.
  '--setting-sources',
  'local',
  '--output-format',
  'text',
];

/** Something said in a conversation: an answer, or what Valentín wrote. */
export interface SaidEvent {
  at: number;
  /** «Jarvis», «pase3», «Valentín → Jarvis». */
  who: string;
  text: string;
}

interface LoggedEvent extends SaidEvent {
  seq: number;
}

export type ReviewRunner = (prompt: string) => Promise<{ code: number; out: string }>;

export interface ReviewVerdict {
  id: string;
  why: string;
}

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const hhmm = (ms: number): string =>
  new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** The prompt: the open asks, what was said after the oldest, and the rules. */
export function reviewPrompt(asks: readonly StoredAsk[], events: readonly SaidEvent[]): string {
  const lines = [
    'Sos el revisor de la lista de pendientes de Valentín («Te toca»): cosas que sus agentes de programación (Jarvis y otros) le pidieron que haga él.',
    'Para cada pendiente abierto, mirá lo que se dijo DESPUÉS de que se pidió y decidí si ya está claramente hecho o ya no hace falta.',
    '',
    'Cerralo sólo si es claro, por ejemplo:',
    '- Valentín dijo que lo hizo («listo», «ya está», «hecho», «ya lo corrí») o contestó lo que se le preguntaba.',
    '- El agente que lo pidió confirmó que ya se hizo (vio el resultado, «quedó mergeado», «ya funciona») o siguió con el paso siguiente que sólo tiene sentido si ya se hizo.',
    '- Un pedido nuevo del mismo agente sobre lo mismo lo reemplazó.',
    '- El agente dijo que ya no hace falta.',
    'No lo cierres si hay duda, si sólo se habló del tema, o si después hubo un problema sin resolver.',
    '',
    'Respondé SÓLO con JSON, sin texto alrededor: {"cerrar":[{"id":"p12","motivo":"frase corta en castellano"}]}. Si no hay nada para cerrar: {"cerrar":[]}.',
    '',
    'Pendientes abiertos:',
  ];
  for (const a of asks) {
    lines.push(`- ${a.id} (pidió ${a.from} a las ${hhmm(a.at)}): ${clip(a.text, 300)}`);
  }
  lines.push('', 'Lo que se dijo después, en orden:');
  let used = 0;
  const shown: string[] = [];
  // The newest matter most: fill from the end, then print in order.
  for (const e of [...events].reverse()) {
    const line = `[${hhmm(e.at)}] ${e.who}: ${clip(e.text, LOG_TEXT_MAX)}`;
    if (used + line.length > PROMPT_EVENTS_CHARS) break;
    used += line.length;
    shown.unshift(line);
  }
  lines.push(...shown);
  return `${lines.join('\n')}\n`;
}

/** The model's answer, read strictly: only ids it was asked about, with a reason. */
export function parseVerdicts(out: string, asked: ReadonlySet<string>): ReviewVerdict[] {
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { cerrar?: unknown })?.cerrar;
  if (!Array.isArray(list)) return [];
  const verdicts: ReviewVerdict[] = [];
  for (const item of list) {
    const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
    const why = typeof item?.motivo === 'string' ? clip(item.motivo, 140) : '';
    if (!asked.has(id) || !why || verdicts.some((v) => v.id === id)) continue;
    verdicts.push({ id, why });
  }
  return verdicts;
}

/** `claude -p` with Haiku: prompt by stdin, an empty temporary folder as cwd. */
const defaultRunner: ReviewRunner = (prompt) =>
  new Promise((resolve) => {
    let cwd: string;
    try {
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-revisor-'));
    } catch {
      resolve({ code: 1, out: '' });
      return;
    }
    const env = agentEnv(process.env);
    const spawnable =
      process.platform === 'win32'
        ? resolveWindowsCommand('claude', REVIEW_ARGS, env)
        : { command: 'claude', args: REVIEW_ARGS };
    try {
      const child = execFile(
        spawnable.command,
        spawnable.args,
        { cwd, env, timeout: REVIEW_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
        (err, stdout) => {
          fs.rmSync(cwd, { recursive: true, force: true });
          const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
          resolve({ code, out: String(stdout ?? '') });
        },
      );
      child.stdin?.end(prompt);
    } catch {
      fs.rmSync(cwd, { recursive: true, force: true });
      resolve({ code: 1, out: '' });
    }
  });

export class AskReviewer {
  private log: LoggedEvent[] = [];
  private seq = 0;
  /** Events up to this one were already in a review. */
  private reviewedSeq = 0;
  private lastRunAt = 0;
  private notBefore = 0;
  private running = false;
  private readonly now: () => number;
  private readonly runner: ReviewRunner;

  constructor(
    private readonly asks: PendingAsks,
    opts: { runner?: ReviewRunner; now?: () => number } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.runner = opts.runner ?? defaultRunner;
  }

  /** Something was said: kept for the next review. */
  note(event: SaidEvent): void {
    const text = event.text.trim();
    if (!text) return;
    this.log.push({ ...event, text: clip(text, LOG_TEXT_MAX), seq: ++this.seq });
    if (this.log.length > LOG_KEPT) this.log = this.log.slice(-LOG_KEPT);
  }

  /** The open asks worth a look: in sight, not taken back by hand, with news after them. */
  private candidates(): StoredAsk[] {
    const fresh = this.log.filter((e) => e.seq > this.reviewedSeq);
    if (fresh.length === 0) return [];
    return this.asks
      .open()
      .filter((a) => !a.reopened && a.delegatedTo === undefined)
      .filter((a) => fresh.some((e) => e.at > a.at))
      .slice(0, ASKS_MAX);
  }

  /** The clock: a review when it is due and there is news; cheap otherwise. */
  async tick(): Promise<ReviewVerdict[]> {
    const now = this.now();
    if (this.running || now < this.notBefore || now - this.lastRunAt < REVIEW_EVERY_MS) return [];
    const asks = this.candidates();
    if (asks.length === 0) return [];
    const oldest = Math.min(...asks.map((a) => a.at));
    const events = this.log.filter((e) => e.at > oldest).slice(-EVENTS_MAX);
    const upTo = this.seq;
    this.running = true;
    this.lastRunAt = now;
    try {
      const result = await this.runner(reviewPrompt(asks, events));
      if (result.code !== 0) {
        this.notBefore = this.now() + REVIEW_BACKOFF_MS;
        return [];
      }
      this.reviewedSeq = upTo;
      const verdicts = parseVerdicts(result.out, new Set(asks.map((a) => a.id)));
      return verdicts.filter((v) => this.asks.closeReviewed(v.id, v.why));
    } catch {
      this.notBefore = this.now() + REVIEW_BACKOFF_MS;
      return [];
    } finally {
      this.running = false;
    }
  }
}
