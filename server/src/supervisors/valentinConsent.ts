/**
 * Valentín's word as a permission (asked 2026-10-22: «que me lo pregunte
 * Jarvis y, cuando diga que sí, lo apruebe sin que tenga que ir a ninguna
 * terminal»). What the guard (supervisorGuard.ts) refuses but marks askable,
 * Jarvis may approve once Valentín said yes — checked by the office, never
 * taken from what Jarvis says:
 * - the office showed him that permission first (the visor, with its own
 *   Aprobar and Rechazar), and shows one at a time;
 * - after that, his latest line in Jarvis's chat (typed or spoken; not an
 *   «[Oficina]» or «[Supervisor]» note) is a plain yes;
 * - that line left the office window (terminal/windowInput.ts): each Enter
 *   the window sent vouches for one line, so text that reached Jarvis any
 *   other way does not count;
 * - one yes approves one permission, within CONSENT_MAX_MS of showing it.
 */

export const CONSENT_MAX_MS = 10 * 60_000;
/** Claude Code records a message right after its Enter; a little slack after. */
const ENTER_BEFORE_MS = 5_000;
const ENTER_AFTER_MS = 500;
/** A longer line says more than yes: Jarvis asks again, or he uses the buttons. */
const YES_MAX_CHARS = 160;

const YES_START =
  /^(si|sip|sii+|dale|ok|okay|okey|de una|aproba\w*|apruebo|autoriz\w*|adelante|hacelo|metele|va|listo|bueno|claro|por supuesto|obvio|confirmo|confirmado|perfecto|joya)\b/;
const NO_ANYWHERE = /\b(no|nunca|ni|rechaz\w*|cancel\w*|espera\w*|frena\w*)\b/;

/** A plain yes: it starts with one and says «no» nowhere. */
export function isYes(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > YES_MAX_CHARS) return false;
  const start = t.replace(/^[^a-z]+/, '').replace(/^jarvis\W*/, '');
  return YES_START.test(start) && !NO_ANYWHERE.test(t);
}

/** One of Valentín's lines in Jarvis's chat (agentChat.ts, role «user»). */
export interface HumanLine {
  id: string;
  at: number;
  text: string;
}

/**
 * Which of `lines` left the office window: in time order, each line takes
 * the first Enter not yet taken that the window sent just before it. A line
 * left without one reached Jarvis some other way.
 */
export function linesFromWindow(
  lines: readonly HumanLine[],
  enters: readonly number[],
): Set<string> {
  const free = [...enters].sort((a, b) => a - b);
  const fromWindow = new Set<string>();
  for (const line of [...lines].sort((a, b) => a.at - b.at)) {
    const i = free.findIndex(
      (t) => t >= line.at - ENTER_BEFORE_MS && t <= line.at + ENTER_AFTER_MS,
    );
    if (i < 0) continue;
    free.splice(i, 1);
    fromWindow.add(line.id);
  }
  return fromWindow;
}

/** Not yet: why, and whether the office must show it to him (again) first. */
export type ConsentVerdict = { ok: true } | { ok: false; reason: string; showAgain?: boolean };

export class ConsentDesk {
  private shown?: { requestId: string; at: number };
  private readonly used = new Set<string>();

  /** The permission shown to Valentín, if any. */
  shownRequest(): string | undefined {
    return this.shown?.requestId;
  }

  /** Show `requestId` to Valentín now; it replaces whatever was shown. */
  show(requestId: string, at = Date.now()): void {
    this.shown = { requestId, at };
  }

  /** It was answered: nothing shown any more. */
  done(requestId: string): void {
    if (this.shown?.requestId === requestId) this.shown = undefined;
  }

  /**
   * May Jarvis approve `requestId` on Valentín's word? `lines` are his lines
   * in Jarvis's chat, oldest first; `enters` when the window sent Enter to
   * Jarvis (linesFromWindow). A yes is used up by the approval.
   */
  check(
    requestId: string,
    lines: readonly HumanLine[],
    enters: readonly number[],
    now = Date.now(),
  ): ConsentVerdict {
    const shown = this.shown;
    if (!shown || shown.requestId !== requestId) {
      return { ok: false, reason: 'Todavía no se lo mostré a Valentín.', showAgain: true };
    }
    if (now - shown.at > CONSENT_MAX_MS) {
      this.shown = undefined;
      return { ok: false, reason: 'Pasó mucho desde que se lo mostré.', showAgain: true };
    }
    const last = lines.filter((l) => l.at > shown.at && !this.used.has(l.id)).at(-1);
    if (!last) return { ok: false, reason: 'Valentín todavía no te contestó.' };
    if (!linesFromWindow(lines, enters).has(last.id)) {
      return {
        ok: false,
        reason:
          'Lo último que te llegó no salió de la ventana de la oficina: no lo tomo como su sí.',
      };
    }
    if (!isYes(last.text)) {
      const said = last.text.length > 80 ? `${last.text.slice(0, 79)}…` : last.text;
      return { ok: false, reason: `Lo último que te dijo («${said}») no es un sí claro.` };
    }
    this.used.add(last.id);
    this.shown = undefined;
    return { ok: true };
  }
}
