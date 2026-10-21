import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { workspaceOf } from '../workspaces/workspaceRules.js';
import { assignAgent, useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import { AgentNote } from './CardExtras.js';
import type { MenuItem, MenuItemId } from './graphMenu.js';
import type { OpenMenu } from './useGraphMenu.js';

/** How long a risky item waits for its second click. */
const CONFIRM_MS = 4000;
const MENU_W = 220;

const itemClass = (danger?: boolean, armed?: boolean) =>
  `border-0 text-left text-xs px-10 py-5 rounded-md cursor-pointer outline-none focus-visible:bg-btn-hover ${
    armed
      ? 'bg-danger text-white font-semibold'
      : danger
        ? 'bg-transparent text-danger hover:bg-btn-hover'
        : 'bg-transparent text-text hover:bg-btn-hover'
  }`;

/** Arrow keys move between the items. */
function moveFocus(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  next?.focus();
}

function Items({ items, onPick }: { items: MenuItem[]; onPick: (id: MenuItemId) => void }) {
  const [armed, setArmed] = useState<MenuItemId | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  return items.map((item, i) => (
    <div key={item.id} className="contents">
      {i > 0 && item.group !== items[i - 1].group && <hr className="my-3 border-border" />}
      <button
        type="button"
        role="menuitem"
        className={itemClass(item.danger, armed === item.id)}
        onClick={() => {
          if (item.confirm && armed !== item.id) setArmed(item.id);
          else onPick(item.id);
        }}
      >
        {armed === item.id ? item.confirm : item.label}
      </button>
    </div>
  ));
}

/** "Mover de espacio": the workspaces, or none. */
function MoveList({ view, onDone }: { view: AgentView; onDone: () => void }) {
  const state = useWorkspaces();
  const current = workspaceOf(view, state);
  const options = [
    ...state.workspaces.map((w) => ({ id: w.id as string | null, label: w.name })),
    { id: null, label: 'Ninguno' },
  ];
  return options.map((o) => (
    <button
      key={o.id ?? 'ninguno'}
      type="button"
      role="menuitem"
      className={itemClass(false, false) + (current === o.id ? ' font-semibold' : '')}
      onClick={() => {
        assignAgent(view.key, o.id);
        onDone();
      }}
    >
      {o.label}
    </button>
  ));
}

/**
 * The graph's right-click (or long-press) menu, where it was opened. Esc, a
 * click elsewhere or picking an item closes it.
 */
export function GraphContextMenu({
  menu,
  bounds,
  onPick,
  onClose,
}: {
  menu: OpenMenu;
  bounds: { w: number; h: number };
  onPick: (id: MenuItemId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // On opening (and on each part: the note, the workspaces), focus its first item.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"], input')?.focus();
  }, [menu.mode, menu.at]);
  // A click elsewhere closes it, and so does moving or zooming the view
  // (it would point at something that moved).
  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', outside, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', outside, true);
    };
  }, []);
  const h = ref.current?.offsetHeight ?? 260;
  const left = Math.max(8, Math.min(menu.at.x, bounds.w - MENU_W - 8));
  const top = Math.max(8, Math.min(menu.at.y, bounds.h - h - 8));
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.view ? `Opciones de ${menu.view.name}` : 'Opciones del grafo'}
      className="absolute z-[75] soft-panel p-4 flex flex-col"
      style={{ left, top, width: MENU_W }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else moveFocus(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.view && (
        <span className="px-10 pt-3 pb-4 text-2xs font-semibold text-text-muted truncate">
          {menu.view.name}
        </span>
      )}
      {menu.mode === 'items' && <Items items={menu.items} onPick={onPick} />}
      {menu.mode === 'note' && menu.view && (
        <div className="p-4">
          <AgentNote view={menu.view} editing onDone={onClose} />
        </div>
      )}
      {menu.mode === 'move' && menu.view && <MoveList view={menu.view} onDone={onClose} />}
    </div>
  );
}
