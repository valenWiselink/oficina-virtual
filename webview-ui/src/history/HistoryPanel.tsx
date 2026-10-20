import type { DayLogEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import type { AgentView } from '../views/agentViews.js';
import { useDayLog } from './dayLogStore.js';
import { dayAchievements, dayLogRows, timeRange } from './dayLogView.js';
import { DayStoryView } from './DayStoryView.js';
import { PrList } from './PrList.js';

export type HistoryTab = 'dia' | 'hoy' | 'prs';

/** Dot colour per kind: the same meanings as the agents' states. */
const KIND_DOT: Record<DayLogEntry['kind'], string> = {
  permiso: 'var(--color-status-permission)',
  tetoca: 'var(--color-status-permission)',
  respuesta: 'var(--color-text-muted)',
  termino: 'var(--color-status-success)',
  tarea: 'var(--color-status-success)',
  cerrado: 'var(--color-border-strong)',
  contexto: 'var(--color-danger)',
  mergeado: 'var(--color-accent)',
  recap: 'var(--color-status-success)',
};

/**
 * Today, three ways: "Tu día" tells it by project and agent (what got done,
 * PRs, what was left for you); "Detalle" is every line in order with the time
 * (achievements on top, from the same lines — results only); "PRs" lists your
 * agents' PRs with what GitHub says about each. A click takes you to the agent.
 */
export function HistoryPanel({
  tab,
  onTabChange,
  views,
  onClose,
  onOpenAgent,
}: {
  tab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
  views: AgentView[];
  onClose: () => void;
  onOpenAgent: (agentId: number) => void;
}) {
  const entries = useDayLog();
  const rows = dayLogRows(entries);
  const achievements = dayAchievements(entries);

  return (
    <aside
      className="absolute top-14 left-14 bottom-80 z-20 w-[min(400px,calc(100%-28px))] soft-panel flex flex-col overflow-hidden"
      aria-label="Historial del día"
    >
      <header className="flex items-center justify-between px-12 pt-10 pb-6">
        <div className="flex rounded-lg bg-bg-thumb p-2" role="tablist" aria-label="Historial">
          {(
            [
              ['dia', 'Tu día'],
              ['hoy', 'Detalle'],
              ['prs', 'PRs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={`border-0 rounded-md px-10 py-3 text-sm font-semibold cursor-pointer ${
                tab === id
                  ? 'bg-bg text-text shadow-soft'
                  : 'bg-transparent text-text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          ×
        </Button>
      </header>
      {tab === 'dia' && <DayStoryView views={views} onOpenAgent={onOpenAgent} />}
      {tab === 'prs' && <PrList views={views} />}
      {tab === 'hoy' && achievements.length > 0 && (
        <div className="flex flex-wrap gap-4 px-12 pb-8">
          {achievements.map((a) => (
            <span
              key={a}
              className="text-2xs font-medium rounded-full px-8 py-2 bg-bg-thumb text-text"
            >
              {a}
            </span>
          ))}
        </div>
      )}
      <ol className="m-0 p-0 list-none overflow-y-auto flex-1 px-6 pb-8" hidden={tab !== 'hoy'}>
        {rows.length === 0 && (
          <li className="px-6 py-8 text-xs text-text-muted">Todavía no pasó nada hoy.</li>
        )}
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className="w-full text-left flex gap-8 px-6 py-5 rounded-md bg-transparent border-0 cursor-pointer hover:bg-bg-thumb"
              onClick={() => row.agentId !== undefined && onOpenAgent(row.agentId)}
              disabled={row.agentId === undefined}
            >
              <span className="text-2xs text-text-muted tabular-nums shrink-0 w-64 pt-1">
                {timeRange(row.from, row.to)}
              </span>
              <span
                className="w-6 h-6 rounded-full shrink-0 mt-5"
                style={{ background: KIND_DOT[row.kind] }}
              />
              <span className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text truncate">{row.agent}</span>
                <span className="text-xs text-text-muted">{row.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
