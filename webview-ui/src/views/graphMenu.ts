import { riskyReason } from '../permissions/riskyCommand.js';
import type { AgentView } from './agentViews.js';
import type { GraphTarget } from './graphHit.js';

/**
 * The graph's right-click (or long-press) menu: which items it offers for
 * what is under the pointer. Pure; GraphContextMenu draws it and
 * useGraphMenu does each item.
 */

export type MenuItemId =
  | 'terminal'
  | 'chat'
  | 'adopt'
  | 'approve'
  | 'deny'
  | 'done'
  | 'pr'
  | 'handoff'
  | 'follow'
  | 'meeting'
  | 'note'
  | 'move'
  | 'edit'
  | 'close'
  | 'member'
  | 'lead'
  | 'fit'
  | 'unpin'
  | 'urgent';

export interface MenuItem {
  id: MenuItemId;
  label: string;
  /** Asks a second click (a risky permission). */
  confirm?: string;
  danger?: boolean;
  /** Goes after a separator. */
  group?: number;
}

/** What the menu can do here (the office's actions that exist). */
export interface MenuAbilities {
  answer: boolean;
  markDone: boolean;
  handOff: boolean;
  adopt: boolean;
  edit: boolean;
  close: boolean;
  workspaces: boolean;
}

/** Who the menu is about: an agent (also from its pill or border arrow), a
 *  member of a meeting, "Vos" or the background. */
export type MenuSubject =
  | { kind: 'agent'; id: number }
  | { kind: 'member'; id: number; member: number }
  | { kind: 'vos' }
  | { kind: 'background' };

export function menuSubject(target: GraphTarget | null): MenuSubject {
  if (!target) return { kind: 'background' };
  if (target.type === 'agent') {
    return target.member === undefined
      ? { kind: 'agent', id: target.id }
      : { kind: 'member', id: target.id, member: target.member };
  }
  if (target.type === 'pill' || target.type === 'arrow') return { kind: 'agent', id: target.id };
  if (target.type === 'vos') return { kind: 'vos' };
  return { kind: 'background' };
}

/** What an agent asks of you right now (approve, done, its PR). */
function askItems(v: AgentView, can: MenuAbilities): MenuItem[] {
  const out: MenuItem[] = [];
  const p = v.permission;
  if (p && can.answer) {
    const risk = riskyReason(p.toolName, p.toolInput as Record<string, unknown>);
    out.push({
      id: 'approve',
      label: 'Aprobar',
      confirm: risk ? `Riesgoso: ${risk}. Confirmar` : undefined,
    });
    out.push({ id: 'deny', label: 'Rechazar' });
  }
  if (!p && v.yourTurnId && can.markDone) out.push({ id: 'done', label: 'Hecho' });
  if (!p && v.prUrl) out.push({ id: 'pr', label: 'Abrir PR' });
  return out;
}

export function agentMenu(v: AgentView, can: MenuAbilities, following: boolean): MenuItem[] {
  const open: MenuItem[] = v.hasTerminal
    ? [
        { id: 'terminal', label: 'Abrir terminal' },
        { id: 'chat', label: 'Ver chat' },
      ]
    : can.adopt && !v.inClaudeApp
      ? [{ id: 'adopt', label: 'Traer a la oficina' }]
      : [];
  const mine: MenuItem[] = [
    ...(can.handOff ? [{ id: 'handoff' as const, label: 'Pasar su resultado a…' }] : []),
    { id: 'follow', label: following ? 'Dejar de seguir' : 'Seguir' },
    ...(v.subagents.length >= 2 ? [{ id: 'meeting' as const, label: 'Enfocar junta' }] : []),
    { id: 'note', label: 'Nota' },
    ...(can.workspaces ? [{ id: 'move' as const, label: 'Mover de espacio' }] : []),
    ...(can.edit ? [{ id: 'edit' as const, label: 'Editar' }] : []),
  ];
  const close: MenuItem[] = can.close
    ? [{ id: 'close', label: 'Cerrar agente', danger: true }]
    : [];
  const groups = [open, askItems(v, can), mine, close];
  return groups.flatMap((items, group) => items.map((item) => ({ ...item, group })));
}

/** The whole menu for what is under the pointer. */
export function menuItems(
  subject: MenuSubject,
  views: readonly AgentView[],
  can: MenuAbilities,
  ctx: { following: number | null; hasPins: boolean },
): MenuItem[] {
  if (subject.kind === 'background') {
    return [
      { id: 'fit', label: 'Encuadrar' },
      ...(ctx.hasPins ? [{ id: 'unpin' as const, label: 'Ordenar solo' }] : []),
    ];
  }
  if (subject.kind === 'vos') {
    const waits = views.some((v) => v.kind === 'needs');
    return waits ? [{ id: 'urgent', label: 'Ir al que espera hace más' }] : [];
  }
  if (subject.kind === 'member') {
    return [
      { id: 'member', label: 'Ver qué está haciendo' },
      { id: 'lead', label: 'Ver a su líder' },
    ];
  }
  const v = views.find((x) => x.id === subject.id);
  return v ? agentMenu(v, can, ctx.following === v.id) : [];
}
