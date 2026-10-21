import { useState } from 'react';

import { showChatOf } from '../chat/chatMode.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import type { Pt } from './graphCamera.js';
import type { GraphTarget } from './graphHit.js';
import {
  type MenuAbilities,
  type MenuItem,
  type MenuItemId,
  menuItems,
  type MenuSubject,
  menuSubject,
} from './graphMenu.js';
import { mostUrgent } from './graphPick.js';
import { clearPins, useHasPins } from './graphPins.js';
import type { GraphControls, GraphSelection } from './useGraphCanvas.js';

export interface OpenMenu {
  at: Pt;
  subject: MenuSubject;
  items: MenuItem[];
  /** The agent it is about (agent menus). */
  view?: AgentView;
  /** Which part shows: the items, or a note / workspace picker. */
  mode: 'items' | 'note' | 'move';
}

interface MenuDeps {
  views: AgentView[];
  actions: BoardActions;
  controls: GraphControls;
  following: number | null;
  pick: (sel: GraphSelection) => void;
  select: (sel: GraphSelection) => void;
}

/** What one agent item does (the ones that need the agent). */
function runAgentItem(id: MenuItemId, v: AgentView, d: MenuDeps): void {
  const a = d.actions;
  const p = v.permission;
  if (id === 'terminal') (a.onOpenTerminal ?? a.onSelect)(v.id);
  else if (id === 'chat') {
    showChatOf(v.id);
    a.onSelect(v.id);
  } else if (id === 'adopt') a.onAdopt?.(v.id);
  else if (id === 'approve' && p) a.onAllow?.(p.requestId);
  else if (id === 'deny' && p) a.onDeny?.(p.requestId);
  else if (id === 'done' && v.yourTurnId) a.onYourTurnDone?.(v.yourTurnId);
  else if (id === 'pr' && v.prUrl) window.open(v.prUrl, '_blank', 'noopener');
  else if (id === 'handoff') a.onHandOff?.(v.id);
  else if (id === 'follow') d.controls.follow(d.following === v.id ? null : v.id);
  else if (id === 'edit') a.onEdit?.(v.id);
  else if (id === 'close') a.onClose?.(v.id);
}

/** What one item does; false when it opens a part of the menu instead. */
function runItem(id: MenuItemId, menu: OpenMenu, d: MenuDeps): boolean {
  const s = menu.subject;
  if (id === 'note' || id === 'move') return false;
  if (id === 'fit') d.controls.fitAll();
  else if (id === 'unpin') clearPins();
  else if (id === 'urgent') {
    const who = mostUrgent(d.views);
    if (who !== null) {
      d.pick({ id: who });
      d.controls.focusOn(who);
    }
  } else if (s.kind === 'member' && id === 'member') d.select({ id: s.id, member: s.member });
  else if (s.kind === 'member' && id === 'lead') {
    d.pick({ id: s.id });
    d.controls.focusOn(s.id);
  } else if (menu.view) runAgentItem(id, menu.view, d);
  return true;
}

/** The right-click / long-press menu: what is open and what each item does. */
export function useGraphMenu(d: MenuDeps) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const hasPins = useHasPins();
  const workspaces = useWorkspaces().workspaces.length > 0;
  const a = d.actions;
  const can: MenuAbilities = {
    answer: !!a.onAllow && !!a.onDeny,
    markDone: !!a.onYourTurnDone,
    handOff: !!a.onHandOff,
    adopt: !!a.onAdopt,
    edit: !!a.onEdit,
    close: !!a.onClose,
    workspaces,
  };
  return {
    menu,
    open: (target: GraphTarget | null, at: Pt) => {
      const subject = menuSubject(target);
      const items = menuItems(subject, d.views, can, { following: d.following, hasPins });
      const view = subject.kind === 'agent' ? d.views.find((v) => v.id === subject.id) : undefined;
      setMenu(items.length > 0 ? { at, subject, items, view, mode: 'items' } : null);
    },
    close: () => setMenu(null),
    run: (id: MenuItemId) => {
      if (!menu) return;
      if (runItem(id, menu, d)) setMenu(null);
      else setMenu({ ...menu, mode: id === 'note' ? 'note' : 'move' });
    },
  };
}
