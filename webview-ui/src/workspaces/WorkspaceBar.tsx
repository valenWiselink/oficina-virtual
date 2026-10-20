import { type DragEvent, type KeyboardEvent, useState } from 'react';

import { ALL, type Workspace, type WorkspaceState } from './workspaceRules.js';
import { reorderWorkspace, selectWorkspace } from './workspaceStore.js';

/**
 * The workspace tabs at the top of the office: "Todos", each workspace and
 * "+". A tab whose agents need you carries an amber count, so nothing waits
 * unseen while you look at another workspace. The workspace on screen offers
 * "Editar" (name, folders, delete) through its ⋯, or a right click. Workspace
 * tabs are dragged to reorder them (a line marks where it lands), or moved
 * with Alt+←/→; "Todos" always stays first.
 */
export function WorkspaceBar({
  state,
  needs,
  onNew,
  onEdit,
}: {
  state: WorkspaceState;
  needs: Record<string, number>;
  onNew: () => void;
  onEdit: (workspace: Workspace) => void;
}) {
  const tabs = [{ id: ALL, name: 'Todos' }, ...state.workspaces];
  const ids = state.workspaces.map((w) => w.id);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  /** The workspace that ends up right after the moved one (null: last). */
  const beforeIdFor = (target: Drop, moving: string): string | null => {
    if (target.side === 'before') return target.id;
    const after = ids.slice(ids.indexOf(target.id) + 1).filter((id) => id !== moving);
    return after[0] ?? null;
  };
  const endDrag = () => {
    setDragging(null);
    setDrop(null);
  };
  const dragHandlers = (id: string): TabDrag => ({
    dragging: dragging === id,
    mark: drop?.id === id && dragging !== id ? drop.side : undefined,
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      setDragging(id);
    },
    onDragOver: (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const box = e.currentTarget.getBoundingClientRect();
      const side = e.clientX < box.left + box.width / 2 ? 'before' : 'after';
      if (drop?.id !== id || drop.side !== side) setDrop({ id, side });
    },
    onDrop: (e) => {
      e.preventDefault();
      if (dragging && drop) reorderWorkspace(dragging, beforeIdFor(drop, dragging));
      endDrag();
    },
    onDragEnd: endDrag,
    onKeyDown: (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      e.stopPropagation();
      const at = ids.indexOf(id);
      if (e.key === 'ArrowLeft' && at > 0) reorderWorkspace(id, ids[at - 1]);
      if (e.key === 'ArrowRight' && at < ids.length - 1) reorderWorkspace(id, ids[at + 2] ?? null);
    },
  });

  return (
    <nav
      className="absolute left-14 top-10 z-10 flex items-center gap-2 rounded-xl bg-bg-thumb/90 border border-border p-2 max-w-[calc(100%-28px)] overflow-x-auto no-scrollbar"
      aria-label="Espacios de trabajo"
    >
      {tabs.map((t) => (
        <Tab
          key={t.id}
          name={t.name}
          active={state.current === t.id}
          waiting={needs[t.id] ?? 0}
          onPick={() => selectWorkspace(t.id)}
          onEdit={t.id === ALL ? undefined : () => onEdit(t as Workspace)}
          drag={t.id === ALL ? undefined : dragHandlers(t.id)}
        />
      ))}
      <button
        type="button"
        onClick={onNew}
        title="Nuevo espacio de trabajo"
        aria-label="Nuevo espacio de trabajo"
        className="shrink-0 border-0 bg-transparent text-text-muted hover:text-text hover:bg-btn-hover rounded-md w-26 h-24 cursor-pointer flex items-center justify-center"
      >
        <span className="material-symbols-sharp text-base" aria-hidden="true">
          add
        </span>
      </button>
    </nav>
  );
}

/** Where a dragged tab would land: just before or just after this one. */
interface Drop {
  id: string;
  side: 'before' | 'after';
}

/** What a workspace tab needs to be dragged (absent on "Todos"). */
interface TabDrag {
  dragging: boolean;
  mark?: Drop['side'];
  onDragStart: (e: DragEvent<HTMLSpanElement>) => void;
  onDragOver: (e: DragEvent<HTMLSpanElement>) => void;
  onDrop: (e: DragEvent<HTMLSpanElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

function Tab({
  name,
  active,
  waiting,
  onPick,
  onEdit,
  drag,
}: {
  name: string;
  active: boolean;
  waiting: number;
  onPick: () => void;
  onEdit?: () => void;
  drag?: TabDrag;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className={`relative shrink-0 flex items-center rounded-md ${active ? 'bg-bg shadow-soft' : ''} ${
        drag?.dragging ? 'opacity-40' : ''
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={!!drag}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
    >
      {drag?.mark && (
        <span
          className={`absolute top-2 bottom-2 w-2 rounded-full bg-accent pointer-events-none ${
            drag.mark === 'before' ? '-left-2' : '-right-2'
          }`}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        aria-pressed={active}
        onClick={onPick}
        onKeyDown={drag?.onKeyDown}
        title={drag ? 'Arrastrala para cambiar el orden (o Alt+← / Alt+→)' : undefined}
        onContextMenu={(e) => {
          if (!onEdit) return;
          e.preventDefault();
          onEdit();
        }}
        className={`border-0 bg-transparent px-8 py-3 text-xs font-medium cursor-pointer flex items-center gap-5 whitespace-nowrap ${
          active ? 'text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        {name}
        {waiting > 0 && (
          <span
            className="text-2xs font-semibold rounded-full px-5 bg-status-permission text-white"
            title={`${waiting} ${waiting === 1 ? 'te necesita' : 'te necesitan'}`}
          >
            {waiting}
          </span>
        )}
      </button>
      {onEdit && (active || hover) && (
        <button
          type="button"
          onClick={onEdit}
          title="Editar espacio"
          aria-label={`Editar el espacio ${name}`}
          className="border-0 bg-transparent text-text-muted hover:text-text pr-6 pl-0 cursor-pointer flex items-center"
        >
          <span className="material-symbols-sharp text-sm" aria-hidden="true">
            more_horiz
          </span>
        </button>
      )}
    </span>
  );
}
