import { useDayLog } from '../history/dayLogStore.js';
import { useNow } from '../hooks/useNow.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { type AgentView, KIND_COLOR } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { callsForYou, controlOrder, stripTitle, toClose } from '../views/controlRules.js';
import { permissionSummary } from '../views/permissionSummary.js';
import { activityOf } from './asistenteRules.js';

/** The last half hour, as six little bars (five minutes each). */
function Activity({ counts, color }: { counts: number[]; color: string }) {
  const top = Math.max(1, ...counts);
  return (
    <span className="flex items-end gap-2 h-12" aria-hidden="true">
      {counts.map((n, i) => (
        <span
          // Six fixed buckets, always in this order: the index is their identity.
          key={`b${i}`}
          className="w-4 rounded-sm"
          style={{
            height: `${Math.max(2, Math.round((n / top) * 12))}px`,
            background: n > 0 ? color : 'var(--color-border)',
          }}
        />
      ))}
    </span>
  );
}

/** One agent: what it does, how busy it was, the permission it holds. */
function TeamRow({
  view,
  actions,
  activity,
}: {
  view: AgentView;
  actions: BoardActions;
  activity: number[];
}) {
  const ask = permissionSummary(view);
  const urgent = callsForYou(view);
  const spare = toClose(view);
  const status = spare ? 'Terminó · para cerrar' : view.statusText;
  return (
    <li
      className={`flex flex-col gap-4 rounded-md px-8 py-6 ${
        urgent ? 'bg-status-permission-bg border border-status-permission' : ''
      } ${spare ? 'opacity-75' : ''}`}
    >
      <span className="flex items-center gap-6 min-w-0">
        <button
          type="button"
          onClick={() => actions.onSelect(view.id)}
          title={`${view.name}: ${status}`}
          className="flex-1 min-w-0 flex items-center gap-6 border-0 bg-transparent p-0 cursor-pointer text-left"
        >
          <span
            className="w-8 h-8 rounded-full shrink-0"
            style={{ background: KIND_COLOR[view.kind] }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-text truncate">{view.name}</span>
        </button>
        <Activity counts={activity} color={KIND_COLOR[view.kind]} />
        {spare && actions.onClose && (
          <button
            type="button"
            onClick={() => actions.onClose?.(view.id)}
            title={`Cerrar a ${view.name} (su conversación queda guardada)`}
            aria-label={`Cerrar a ${view.name}`}
            className="shrink-0 border-0 bg-transparent p-0 text-xs leading-none text-text-muted hover:text-text cursor-pointer"
          >
            ×
          </button>
        )}
      </span>
      <span
        className={`text-2xs truncate ${urgent ? 'text-status-permission-text' : 'text-text-muted'}`}
      >
        {status}
      </span>
      {ask && view.permission && actions.onAllow && actions.onDeny && (
        <>
          <span className="text-2xs text-text line-clamp-2" title={ask.detail ?? ask.title}>
            {ask.title}
            {ask.detail ? `: ${ask.detail}` : ''}
          </span>
          <ApproveButtons
            permission={view.permission}
            onAllow={actions.onAllow}
            onDeny={actions.onDeny}
          />
        </>
      )}
    </li>
  );
}

/**
 * Only the agents that need you (a held permission, a question): what still
 * shows in a meeting, since it holds someone back.
 */
export function NeedsYouStrip({ views, actions }: { views: AgentView[]; actions: BoardActions }) {
  const log = useDayLog();
  const now = useNow();
  const needing = views.filter(callsForYou);
  if (needing.length === 0) return null;
  return (
    <section
      aria-label="Te necesitan"
      className="shrink-0 w-full max-w-[920px] mx-auto soft-panel px-6 py-6"
    >
      <ul className="m-0 p-0 list-none grid gap-6 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {needing.map((v) => (
          <TeamRow key={v.id} view={v} actions={actions} activity={activityOf(log, v.name, now)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * «Equipo»: every agent, who needs you first, with what it is doing and how
 * busy it was in the last half hour. A held permission is answered right
 * here; a finished one the office no longer needs closes with its ×.
 */
export function TeamColumn({ views, actions }: { views: AgentView[]; actions: BoardActions }) {
  const log = useDayLog();
  const now = useNow();
  const ordered = controlOrder(views);
  return (
    <section aria-label="Equipo" className="w-full h-full soft-panel flex flex-col overflow-hidden">
      <h2 className="m-0 px-12 pt-10 pb-4 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {stripTitle(views)}
      </h2>
      {ordered.length === 0 ? (
        <p className="m-0 px-12 py-6 text-xs text-text-muted">No hay agentes en la oficina.</p>
      ) : (
        <ul className="m-0 p-0 px-4 pb-8 list-none flex flex-col gap-2 overflow-y-auto">
          {ordered.map((v) => (
            <TeamRow
              key={v.id}
              view={v}
              actions={actions}
              activity={activityOf(log, v.name, now)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
