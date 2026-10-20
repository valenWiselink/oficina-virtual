import { usePrStatuses } from '../prs/prStatusStore.js';
import type { AgentView } from '../views/agentViews.js';
import { useDayLog } from './dayLogStore.js';
import { collectPrs, type PrRow } from './prRows.js';

const STATE_LABEL: Record<NonNullable<PrRow['state']>, { text: string; className: string }> = {
  open: { text: 'Abierto', className: 'bg-status-permission-bg text-status-permission-text' },
  merged: { text: 'Mergeado', className: 'bg-active-bg text-accent-bright' },
  closed: { text: 'Cerrado', className: 'bg-bg-thumb text-text-muted' },
};

/** Your agents' PRs in one list; a click opens it on GitHub. */
export function PrList({ views }: { views: AgentView[] }) {
  const rows = collectPrs(views, useDayLog(), usePrStatuses());
  if (rows.length === 0) {
    return (
      <p className="m-0 px-12 py-8 text-xs text-text-muted">
        Todavía ningún agente dejó un PR hoy.
      </p>
    );
  }
  return (
    <ol className="m-0 p-0 list-none overflow-y-auto flex-1 px-6 pb-8">
      {rows.map((row) => {
        const state = row.state ? STATE_LABEL[row.state] : undefined;
        return (
          <li key={row.url}>
            <button
              type="button"
              title={row.url}
              className="w-full text-left flex items-start gap-8 px-6 py-6 rounded-md bg-transparent border-0 cursor-pointer hover:bg-bg-thumb"
              onClick={() => window.open(row.url, '_blank', 'noopener')}
            >
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-text truncate">
                  {row.title ?? row.short}
                </span>
                <span className="text-2xs text-text-muted truncate">
                  {row.short} · {row.agent}
                </span>
              </span>
              {state && (
                <span
                  className={`shrink-0 text-2xs font-medium rounded-full px-7 py-1 ${state.className}`}
                >
                  {state.text}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
