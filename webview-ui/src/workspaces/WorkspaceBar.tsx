import { useState } from 'react';

import { ALL, type Workspace, type WorkspaceState } from './workspaceRules.js';
import { selectWorkspace } from './workspaceStore.js';

/**
 * The workspace tabs at the top of the office: "Todos", each workspace and
 * "+". A tab whose agents need you carries an amber count, so nothing waits
 * unseen while you look at another workspace. The workspace on screen offers
 * "Editar" (name, folders, delete) through its ⋯, or a right click.
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

function Tab({
  name,
  active,
  waiting,
  onPick,
  onEdit,
}: {
  name: string;
  active: boolean;
  waiting: number;
  onPick: () => void;
  onEdit?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className={`shrink-0 flex items-center rounded-md ${active ? 'bg-bg shadow-soft' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onPick}
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
