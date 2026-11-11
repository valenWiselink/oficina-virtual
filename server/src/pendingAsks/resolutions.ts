/**
 * Several asks settled in one sentence (design C «Momentos», cut 6): Valentín
 * says «mergealo y lo de las páginas públicas, sí», Jarvis reads it and calls
 * `resolver_pendientes`. The office does not act at once: it shows how each
 * one was taken («Lo tomé como Sí»), with «Deshacer», and applies it after a
 * few seconds. A merge is never done by voice: it waits for him to hold the
 * button down (the office's «Mergear» runs it, askMerger.ts).
 */
import { readWhen, whenText } from '../../../core/src/askTime.js';
import type {
  AskResolutionEntry,
  AskResolutionsList,
  Meeting,
} from '../../../core/src/messages.js';
import { openMergeTarget, type PendingAsks } from './pendingAsks.js';

/** How long «Deshacer» stays before it is done. */
export const UNDO_MS = 10_000;
/** A merge waiting for the held button goes away after this long. */
const HOLD_KEPT_MS = 10 * 60_000;

export type ResolutionHow = 'respuesta' | 'hecho' | 'posponer' | 'mergear';

export interface Proposed {
  id: string;
  como: ResolutionHow;
  /** «Sí», «No», «La A»: what he answered (como respuesta). */
  respuesta?: string;
  /** When it comes back (como posponer): «mañana», «después de: Demo». */
  cuando?: string;
}

interface Pending extends AskResolutionEntry {
  how: ResolutionHow;
  answer?: string;
  until?: number;
  /** When it was proposed. */
  at: number;
}

interface Deps {
  asks: () => PendingAsks | undefined;
  broadcast: (message: AskResolutionsList) => void;
  meetings?: () => readonly Meeting[];
  /** Tell Jarvis what he undid. */
  tellJarvis?: (text: string) => void;
  now?: () => number;
  /** Arms the timer that applies what was not undone (tests pass a no-op). */
  schedule?: (run: () => void, ms: number) => void;
}

const clip = (text: string, max = 90): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export class AskResolutions {
  private pending: Pending[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? Date.now;
  }

  message(): AskResolutionsList {
    const items = this.pending.map(
      ({ key, id, text, label, applyAt, hold }): AskResolutionEntry => ({
        key,
        id,
        text,
        label,
        hold,
        ...(applyAt !== undefined ? { applyAt } : {}),
      }),
    );
    return { type: 'askResolutions', items };
  }

  /**
   * Jarvis's reading of what Valentín said: each one shown with «Deshacer»
   * and applied after UNDO_MS (a merge waits for the held button). Returns
   * what was taken and why the rest was not.
   */
  propose(items: readonly Proposed[]): { taken: string[]; refused: string[] } {
    const taken: string[] = [];
    const refused: string[] = [];
    for (const item of items) {
      const made = this.make(item);
      if (typeof made === 'string') refused.push(made);
      else {
        this.pending = this.pending.filter((p) => p.id !== made.id);
        this.pending.push(made);
        taken.push(`${made.id}: ${made.label}`);
      }
    }
    if (taken.length > 0) {
      this.changed();
      (this.deps.schedule ?? defaultSchedule)(() => this.tick(), UNDO_MS + 50);
    }
    return { taken, refused };
  }

  private make(item: Proposed): Pending | string {
    const ask = this.deps.asks()?.find(item.id);
    if (!ask || ask.closedAt !== undefined) return `${item.id}: no está abierto`;
    const now = this.now();
    const base = { key: `r${++this.seq}`, id: ask.id, text: clip(ask.text), at: now };
    if (item.como === 'mergear') {
      const target = openMergeTarget(ask);
      if (!target) return `${ask.id}: no tiene un PR abierto para mergear`;
      const number = target.url.split('/').pop();
      // Never by voice: he holds the button down.
      return { ...base, how: 'mergear', label: `Mergear #${number}`, hold: true };
    }
    const applyAt = now + UNDO_MS;
    if (item.como === 'hecho')
      return { ...base, how: 'hecho', label: 'Hecho', hold: false, applyAt };
    if (item.como === 'respuesta') {
      const answer = item.respuesta?.trim();
      if (!answer) return `${ask.id}: falta la respuesta`;
      return {
        ...base,
        how: 'respuesta',
        answer,
        label: `«${clip(answer, 40)}»`,
        hold: false,
        applyAt,
      };
    }
    const when = item.cuando ? readWhen(item.cuando, now, this.deps.meetings?.() ?? []) : undefined;
    if (!when) return `${ask.id}: no entendí cuándo («${item.cuando ?? ''}»)`;
    const label = `Posponer a ${when.after ? `después de ${when.after}` : whenText(when.at, now)}`;
    return { ...base, how: 'posponer', until: when.at, label, hold: false, applyAt };
  }

  /** «Deshacer»: it is not done, and Jarvis hears it. */
  undo(key: string): void {
    const found = this.pending.find((p) => p.key === key);
    if (!found) return;
    this.pending = this.pending.filter((p) => p !== found);
    this.changed();
    this.deps.tellJarvis?.(
      `[Oficina] Valentín deshizo «${found.label}» en ${found.id} («${found.text}»): no lo tomes así, preguntale.`,
    );
  }

  /** Apply what is due; drop what is closed already or waited too long for the button. */
  tick(): void {
    const now = this.now();
    const asks = this.deps.asks();
    const before = this.pending.length;
    const keep: Pending[] = [];
    for (const p of this.pending) {
      const open = asks?.find(p.id)?.closedAt === undefined;
      if (!open || (p.hold && now - p.at > HOLD_KEPT_MS)) continue;
      if (p.applyAt !== undefined && p.applyAt <= now && asks) this.apply(p, asks);
      else keep.push(p);
    }
    this.pending = keep;
    if (keep.length !== before) this.changed();
  }

  private apply(p: Pending, asks: PendingAsks): void {
    if (p.how === 'respuesta' && p.answer) asks.answeredBy(`[${p.id}] ${p.answer}`, this.now());
    else if (p.how === 'hecho') asks.closeById(p.id, 'Lo diste por hecho hablando');
    else if (p.how === 'posponer' && p.until !== undefined) asks.snooze(p.id, p.until);
  }

  private changed(): void {
    this.deps.broadcast(this.message());
  }
}

function defaultSchedule(run: () => void, ms: number): void {
  const timer = setTimeout(run, ms);
  timer.unref?.();
}
