import type { Meeting } from '../../../core/src/messages.js';
import type { NowModel } from '../now/useNowQueue.js';
import type { AgentView } from '../views/agentViews.js';
import { callsForYou } from '../views/controlRules.js';

const MIN = 60_000;

/** The meeting that is on or comes next (a quiet one too: it is still yours). */
export function nextMeeting(meetings: readonly Meeting[], now: number): Meeting | undefined {
  return [...meetings].filter((m) => m.end > now).sort((a, b) => a.start - b.start)[0];
}

/** «ahora», «en 12 min», «en 6 h 12 min». */
export function untilText(meeting: Meeting, now: number): string {
  if (meeting.start <= now) return 'ahora';
  const min = Math.ceil((meeting.start - now) / MIN);
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest > 0 ? `en ${h} h ${rest} min` : `en ${h} h`;
}

const BUSY: readonly AgentView['kind'][] = ['work', 'think', 'research', 'meet'];

/** Doing something right now: busy, and not one that only waits for its
 *  supervisor («Lo atiende Jarvis» is painted as working, but it is stopped). */
export function isWorking(v: Pick<AgentView, 'kind' | 'askingSupervisor'>): boolean {
  return BUSY.includes(v.kind) && !v.askingSupervisor;
}

/** Agents doing something right now. */
export function workingCount(views: readonly AgentView[]): number {
  return views.filter(isWorking).length;
}

/** A session outside the office that wrote nothing for this long is not
 *  working, whatever its last state says (a desktop-app window closed mid-turn
 *  keeps «Corriendo» forever). */
export const OUTSIDE_STILL_MS = 30 * MIN;

/**
 * The sessions outside the office (VS Code, the desktop app) worth a look in
 * Núcleo's folded «Otras sesiones»: the ones that need Valentín (a permission,
 * a «Te toca») or really work. Finished ones and the ones Jarvis attends stay
 * out: they filled «En marcha» and its count (2026-11-26).
 */
export function outsideWorthSeeing(outside: readonly AgentView[], now: number): AgentView[] {
  return outside.filter(
    (v) =>
      callsForYou(v) ||
      (isWorking(v) && (v.lastRecordAt === undefined || now - v.lastRecordAt < OUTSIDE_STILL_MS)),
  );
}

/**
 * What needs Valentín, as one key: it changes when a new permission or a new
 * first «Te toca» shows up (the sphere buds toward «Te necesita» once), not
 * when one goes away. Empty when nothing needs him.
 */
export function needKeyOf(views: readonly AgentView[], model: Pick<NowModel, 'queue'>): string {
  const holding = views
    .filter(callsForYou)
    .map((v) => v.permission?.requestId ?? `a${v.id}`)
    .sort();
  const first = model.queue.first?.ask.id;
  return [...holding, ...(first ? [first] : [])].join(',');
}

/** What Jarvis is doing, as the sphere and its sentence show it. */
export type PresenceMode = 'reposo' | 'escucha' | 'piensa' | 'habla' | 'necesita';

const PHRASE: Record<Exclude<PresenceMode, 'reposo'>, string> = {
  escucha: 'Lo escucho, señor.',
  piensa: 'Déjeme ver…',
  habla: 'Le respondo.',
  necesita: 'Necesito su permiso, señor.',
};

/** Between turns: a finished answer or nothing to do (his quiet kinds). */
function between(jarvis: AgentView): boolean {
  return jarvis.kind === 'done' || jarvis.kind === 'idle';
}

/**
 * Jarvis between turns while agents work: he is not done, he is directing
 * them (pure: tested). A permission or a turn under way keep their own look.
 */
export function coordinating(jarvis: AgentView | undefined, working: number): boolean {
  return !!jarvis && working > 0 && between(jarvis);
}

/**
 * The sentence beside his name (pure: tested). `working` counts the OTHER
 * agents at work: between turns he coordinates them, or waits when nobody
 * works. «Terminó» is an agent's word for a finished turn, never his.
 */
export function presencePhrase(
  mode: PresenceMode,
  jarvis: AgentView | undefined,
  working = 0,
): string {
  if (mode !== 'reposo') return PHRASE[mode];
  if (!jarvis) return 'No está en la oficina';
  if (coordinating(jarvis, working))
    return `Coordinando a ${working} ${working === 1 ? 'agente' : 'agentes'}`;
  if (between(jarvis)) return 'En espera';
  return jarvis.statusText;
}

/** His turn is under way: thinking, a tool, research (pure: tested). */
export function isThinking(jarvis: AgentView | undefined): boolean {
  return !!jarvis && ['think', 'work', 'research', 'meet'].includes(jarvis.kind);
}

/** How long an answer «speaks»: its words, quick, within bounds (pure: tested). */
export function speakingPlan(text: string): { words: number; everyMs: number } {
  const words = Math.max(1, Math.min(60, text.trim().split(/\s+/).length));
  return { words, everyMs: Math.max(45, Math.min(150, 2000 / words)) };
}
