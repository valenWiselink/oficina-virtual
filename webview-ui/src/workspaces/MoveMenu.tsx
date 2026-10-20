import type { AgentView } from '../views/agentViews.js';
import { workspaceOf } from './workspaceRules.js';
import { assignAgent, useWorkspaces } from './workspaceStore.js';

/** "Mover a…": put this agent in a workspace by hand, or in none. */
export function MoveMenu({ view, onClose }: { view: AgentView; onClose: () => void }) {
  const state = useWorkspaces();
  const current = workspaceOf(view, state);
  const options = [
    ...state.workspaces.map((w) => ({ id: w.id as string | null, label: w.name })),
    { id: null, label: 'Ninguno' },
  ];
  return (
    <div
      className="absolute right-4 top-36 z-30 soft-panel p-4 flex flex-col min-w-140"
      onClick={(e) => e.stopPropagation()}
      role="menu"
      aria-label="Mover a un espacio"
    >
      <span className="px-8 pt-2 pb-4 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Mover a
      </span>
      {options.map((o) => (
        <button
          key={o.id ?? 'ninguno'}
          type="button"
          role="menuitemradio"
          aria-checked={current === o.id}
          className={`border-0 text-left text-xs px-8 py-4 rounded-md cursor-pointer ${
            current === o.id
              ? 'bg-active-bg text-text font-medium'
              : 'bg-transparent text-text hover:bg-btn-hover'
          }`}
          onClick={() => {
            assignAgent(view.key, o.id);
            onClose();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
