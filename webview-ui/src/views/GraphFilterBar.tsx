import type { AgentView } from './agentViews.js';
import { filterCounts, GRAPH_FILTERS, type GraphFilter } from './graphFilter.js';

/** "Todos · Te necesitan · Trabajando · Sin tarea", just above the zoom
 *  buttons: fades the others. */
export function GraphFilterBar({
  views,
  filter,
  onChange,
}: {
  views: AgentView[];
  filter: GraphFilter;
  onChange: (filter: GraphFilter) => void;
}) {
  const counts = filterCounts(views);
  return (
    <div
      role="radiogroup"
      aria-label="Resaltar por estado"
      className="absolute right-14 bottom-80 z-10 soft-panel p-3 flex gap-2"
    >
      {GRAPH_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={filter === f.id}
          title={f.id === 'all' ? 'Todos nítidos' : 'Los demás se apagan, no se esconden'}
          className={`border-0 rounded-md px-8 py-3 text-xs cursor-pointer whitespace-nowrap ${
            filter === f.id
              ? 'bg-active-bg text-text font-semibold'
              : 'bg-transparent text-text-muted hover:text-text hover:bg-btn-hover'
          }`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
          {f.id !== 'all' && <span className="ml-4 tabular-nums">{counts[f.id]}</span>}
        </button>
      ))}
    </div>
  );
}
