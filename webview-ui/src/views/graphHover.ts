import { type AgentKind, type AgentView, waitedFor } from './agentViews.js';

/**
 * Hovering the graph: after a short dwell on an agent or a member, a quick
 * card says everything its label clips, and the rest of the graph fades so
 * its team stands out. Pure: what stays crisp, when the card shows, what it
 * says.
 */

/** An agent, or one member of its meeting. */
export interface HoverTarget {
  id: number;
  member?: number;
}

export const HOVER_DWELL_MS = 300;
/** How visible everything outside the hovered team stays. */
export const DIM_ALPHA = 0.4;

const keyOf = (t: HoverTarget | null) => (t ? `${t.id}:${t.member ?? ''}` : '');

/**
 * What stays crisp while you hover an agent (or one of its members): the
 * agent, its meeting, its supervisors, the team it supervises, "Vos" when it
 * waits on you, the library when one of them reads there, and whoever a
 * member passed a file to. Node keys as the scene names them (`a3`, `s-7`).
 */
export function focusOf(
  list: readonly AgentView[],
  target: HoverTarget,
  fileLinks: ReadonlyArray<{ fromId: number; toId: number }> = [],
): Set<string> {
  const keys = new Set<string>();
  const v = list.find((x) => x.id === target.id);
  if (!v) return keys;
  keys.add(`a${v.id}`);
  for (const s of v.subagents) keys.add(`s${s.id}`);
  for (const boss of v.supervisedBy) keys.add(`a${boss}`);
  for (const o of list) if (o.supervisedBy.includes(v.id)) keys.add(`a${o.id}`);
  if (v.kind === 'needs') keys.add('vos');
  if (v.kind === 'research' || v.subagents.some((s) => s.kind === 'research')) keys.add('library');
  const team = new Set(keys);
  for (const link of fileLinks) {
    if (team.has(`s${link.fromId}`) || team.has(`s${link.toId}`)) {
      keys.add(`s${link.fromId}`);
      keys.add(`s${link.toId}`);
    }
  }
  return keys;
}

/** The card shows once the mouse rested HOVER_DWELL_MS on the same target,
 *  and goes as soon as it leaves (no fades: calm mode or not). */
export class HoverDwell {
  private key = '';
  private since = 0;
  private shown: HoverTarget | null = null;

  /** The target under the mouse this frame; returns what the card shows. */
  update(target: HoverTarget | null, now: number): HoverTarget | null {
    const key = keyOf(target);
    if (key !== this.key) {
      this.key = key;
      this.since = now;
      this.shown = null;
    }
    if (target && !this.shown && now - this.since >= HOVER_DWELL_MS) this.shown = target;
    return this.shown;
  }
}

/** What the quick card says, whole (the canvas label clips name and state). */
export interface HoverFacts {
  name: string;
  status: string;
  kind: AgentKind;
  palette: number;
  hueShift: number;
  /** "Te espera hace 12 min". */
  waited?: string;
  /** Ticket · folder. */
  meta?: string;
  /** "Tareas 3 de 7". */
  tasks?: string;
  /** "Contexto 42%". */
  context?: string;
  /** Start of its last answer. */
  reply?: string;
  /** A member: whose meeting it is in, and its latest tools (newest first). */
  lead?: string;
  tools?: string[];
}

export function hoverFacts(
  list: readonly AgentView[],
  target: HoverTarget,
  now: number,
): HoverFacts | null {
  const v = list.find((x) => x.id === target.id);
  if (!v) return null;
  const look = { palette: v.palette, hueShift: v.hueShift };
  if (target.member !== undefined) {
    const s = v.subagents.find((x) => x.id === target.member);
    if (!s) return null;
    return {
      ...look,
      name: s.label,
      status: s.statusText,
      kind: s.kind,
      lead: `En la junta de ${v.name}`,
      tools: s.recent ?? [],
    };
  }
  const [done, total] = (v.progress ?? '').split('/');
  return {
    ...look,
    name: v.name,
    status: v.statusText,
    kind: v.kind,
    waited:
      v.waitingSince !== undefined ? `Te espera ${waitedFor(v.waitingSince, now)}` : undefined,
    // Its folder only when the name is not already the folder's.
    meta: [v.ticket, v.folder].filter(Boolean).join(' · ') || undefined,
    tasks: total ? `Tareas ${done} de ${total}` : undefined,
    context: v.contextPct !== undefined ? `Contexto ${v.contextPct}%` : undefined,
    reply: v.lastReplyHead,
  };
}

/** Gap between a node and its card, and between the card and the border. */
const CARD_GAP = 12;
const CARD_MARGIN = 8;

/** Where the card goes (its top-left, CSS px): beside the node, on its right
 *  unless that runs out of the view, never past the borders. */
export function cardSpot(
  node: { x: number; y: number; r: number },
  card: { w: number; h: number },
  view: { w: number; h: number },
): { left: number; top: number } {
  const right = node.x + node.r + CARD_GAP;
  const left = right + card.w <= view.w - CARD_MARGIN ? right : node.x - node.r - CARD_GAP - card.w;
  const top = node.y - card.h / 2;
  const clamp = (v: number, max: number) => Math.max(CARD_MARGIN, Math.min(v, max - CARD_MARGIN));
  return { left: clamp(left, view.w - card.w), top: clamp(top, view.h - card.h) };
}
