import type { PermissionPending } from '../../../core/src/messages.js';
import { describeToolInput } from '../permissions/describeToolInput.js';
import type { AgentKind, AgentView } from '../views/agentViews.js';

/**
 * Jarvis has no avatar (asked for 2026-10-22: "sin avatar, sin presencia,
 * como las películas"). It is the office's one supervisor of everyone; the
 * board, the graph and every list leave it out, and it lives in its bubble in
 * the office's corner (JarvisBubble) and, when it needs you, in the middle of
 * the screen (JarvisVisor). Pure, so it is tested without a DOM.
 */

/** The office's Jarvis: the oldest supervisor of everyone (one per office; an
 *  older office may have made two, the others stay ordinary cards). */
export function findJarvis(views: readonly AgentView[]): AgentView | undefined {
  let found: AgentView | undefined;
  for (const v of views) {
    if (v.supervision?.kind === 'all' && (!found || v.id < found.id)) found = v;
  }
  return found;
}

/** The office without Jarvis: not a card, a node or a tab, and no «Lo
 *  supervisa Jarvis» on every card (it watches everyone). An agent it is
 *  handling still says so ("Lo atiende Jarvis"). */
export function withoutJarvis(views: AgentView[], jarvis: AgentView | undefined): AgentView[] {
  if (!jarvis) return views;
  return views
    .filter((v) => v.id !== jarvis.id)
    .map((v) =>
      v.supervisedBy.includes(jarvis.id)
        ? {
            ...v,
            supervisedBy: v.supervisedBy.filter((id) => id !== jarvis.id),
            supervisorNames: v.supervisorNames.filter((n) => n !== jarvis.name),
          }
        : v,
    );
}

/** How its ring looks: not in the office, quiet, working, or waiting on you. */
export type JarvisMood = 'away' | 'idle' | 'busy' | 'needs';

export function jarvisMood(jarvis: AgentView | undefined): JarvisMood {
  if (!jarvis) return 'away';
  if (jarvis.kind === 'needs') return 'needs';
  if (jarvis.kind === 'done' || jarvis.kind === 'idle') return 'idle';
  return 'busy';
}

/** What its panel says: what it needs from you, else the start of its latest
 *  answer, else what it is doing. */
export function jarvisLine(jarvis: AgentView): string {
  if (jarvis.permission) {
    const { title } = describeToolInput(jarvis.permission.toolName, jarvis.permission.toolInput);
    const what = title.replace(/^Quiere\s+/i, '');
    return `Necesito su permiso, señor: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`;
  }
  if (jarvis.kind === 'needs' && jarvis.yourTurn) return jarvis.yourTurn;
  if (jarvis.kind === 'needs' && jarvis.asksInTerminal) {
    return 'Le pregunto algo en mi conversación, señor.';
  }
  return (
    jarvis.lastReplyHead ??
    (jarvis.kind === 'idle' ? 'A su disposición, señor.' : jarvis.statusText)
  );
}

/** Another agent's permission Jarvis asks you about, and that agent. */
export interface AskedPermission {
  agent: AgentView;
  permission: PermissionPending;
}

/** The permission Jarvis is asking you about (the office shows it; you may
 *  also say yes to Jarvis), while it is still pending. */
export function askedPermission(
  jarvis: AgentView | undefined,
  views: readonly AgentView[],
): AskedPermission | undefined {
  const id = jarvis?.asksPermission;
  if (!id) return undefined;
  for (const v of views) {
    if (v.permission?.requestId === id) return { agent: v, permission: v.permission };
  }
  return undefined;
}

/** What the visor says about it, in Jarvis's words. */
export function askedLine({ agent, permission }: AskedPermission): string {
  const { title } = describeToolInput(permission.toolName, permission.toolInput);
  const what = title.replace(/^Quiere\s+/i, '');
  return `«${agent.name}» quiere ${what.charAt(0).toLowerCase()}${what.slice(1)}. ¿Lo autorizo, señor?`;
}

/**
 * The one thing the visor is about, or none: another agent's permission it
 * asks you about, a permission it holds, or what its finished turn left for
 * you. Each shows once: dismissing it leaves it in its bubble, and the next one
 * comes up again.
 */
export function visorKey(
  jarvis: AgentView | undefined,
  asked?: AskedPermission,
): string | undefined {
  if (jarvis && asked) return `pide:${asked.permission.requestId}`;
  if (!jarvis || jarvis.kind !== 'needs') return undefined;
  if (jarvis.permission) return `permiso:${jarvis.permission.requestId}`;
  if (jarvis.yourTurnId) return `turno:${jarvis.yourTurnId}`;
  return undefined;
}

/**
 * What the visor is up for, if anything: what Jarvis needs from you, muted or
 * not; what it is saying (its subtitles) only while it is not muted here
 * (asked 2026-10-30: «si tengo muteado a Jarvis que no me salga la burbuja»).
 * Muted, «Probar» in Ajustes still sounds, without the visor.
 */
export function visorMode(
  needs: boolean,
  speaking: boolean,
  muted: boolean,
): 'needs' | 'speaking' | undefined {
  if (needs) return 'needs';
  return speaking && !muted ? 'speaking' : undefined;
}

/**
 * The tooltip of its round button. Closed, it says its latest line — the
 * start of its answer, a box beside the button whenever the pointer rests
 * there — except while you muted it: then only what it needs from you
 * («Te toca:», a permission) (asked 2026-10-30: nothing of what it says
 * floats while it is muted).
 */
export function bubbleTitle(jarvis: AgentView | undefined, open: boolean, muted: boolean): string {
  if (!jarvis) return 'Jarvis';
  if (open) return 'Minimizar';
  const needsYou = jarvis.kind === 'needs' || !!jarvis.permission;
  return muted && !needsYou ? 'Abrir a Jarvis' : jarvisLine(jarvis);
}

/** What led to the ask, for the visor: the start of its answer up to its
 *  «Te toca:», when that is not the ask itself. */
export function visorContext(replyHead: string | undefined, ask: string): string | undefined {
  const before = replyHead
    ?.split(/te toca:/i)[0]
    .replace(/…$/, '')
    .trim();
  return before && !ask.includes(before) ? before : undefined;
}

const lastSegment = (p: string) => p.split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() ?? '';

/** Where to call Jarvis: the folder most of the office works in, else the
 *  first one the office knows. */
export function jarvisHome<D extends { path: string }>(
  directories: readonly D[],
  views: readonly AgentView[],
): D | undefined {
  const count = new Map<string, number>();
  for (const v of views)
    if (v.dir) count.set(v.dir.toLowerCase(), (count.get(v.dir.toLowerCase()) ?? 0) + 1);
  let best: D | undefined;
  let bestCount = -1;
  for (const d of directories) {
    const n = count.get(lastSegment(d.path)) ?? 0;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/** Kinds where it is in the middle of a turn. */
export const BUSY_KINDS: ReadonlySet<AgentKind> = new Set(['work', 'think', 'meet', 'research']);

/** What the speech trigger remembers between renders. */
export interface SpeechWatch {
  id?: number;
  busy: boolean;
  /** Its answer when the current (or the last) turn started. */
  headAtStart?: string;
  /** When its last turn ended while its new answer was not read yet (ms). */
  endedAt?: number;
}

/** How long after a turn ends its answer may still arrive. */
export const ANSWER_LAG_MS = 15_000;

/**
 * One step of «should Jarvis say its answer now»: a turn of its ended and its
 * answer is new. The end of a turn comes from a hook, at once; the answer is
 * read from the transcript a moment later (measured 2026-10-22: the first
 * version waited for neither and never spoke). So an ended turn keeps waiting
 * for a new answer, up to ANSWER_LAG_MS. Never on page load, never an answer
 * already heard, never mid-turn for a permission. And only an answer with
 * something to say aloud (`aloud`, the office's `saysAloud`): one to an
 * «[Oficina]» notice without a «Te toca:» shows in its chat and stays silent.
 */
export function speechStep(
  prev: SpeechWatch,
  now: { id?: number; busy: boolean; head?: string; asksPermission: boolean; aloud: boolean },
  at: number,
): { next: SpeechWatch; speak: boolean } {
  if (now.id === undefined || prev.id !== now.id) {
    return { next: { id: now.id, busy: now.busy, headAtStart: now.head }, speak: false };
  }
  if (now.busy) {
    const headAtStart = prev.busy ? prev.headAtStart : now.head;
    return { next: { id: now.id, busy: true, headAtStart }, speak: false };
  }
  const endedAt = prev.busy ? at : prev.endedAt;
  const waiting = endedAt !== undefined && at - endedAt <= ANSWER_LAG_MS;
  if (waiting && !now.asksPermission && !!now.head && now.head !== prev.headAtStart) {
    return { next: { id: now.id, busy: false, headAtStart: now.head }, speak: now.aloud };
  }
  return {
    next: {
      id: now.id,
      busy: false,
      headAtStart: prev.headAtStart,
      endedAt: waiting ? endedAt : undefined,
    },
    speak: false,
  };
}
