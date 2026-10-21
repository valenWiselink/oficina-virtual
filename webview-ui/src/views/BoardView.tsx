import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { type AgentView, BOARD_COLUMNS, byUrgency } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { BoardGreeting, EmptyColumnLine } from './BoardGreeting.js';
import { useCardMotions } from './cardMotion.js';
import { dismissAbsence } from './presence.js';
import { byLatest } from './unread.js';

/**
 * Agents grouped by what they need from you: "Te necesita" first (permission
 * or a question), then working, finished and without a task. A card moves
 * column as soon as its state changes. "Te necesita" puts what blocks an
 * agent first and the longest wait on top; "Terminó", the latest answer on
 * top (a dot marks the ones you have not read); the rest keep id order.
 * Above them, the greeting line (BoardGreeting: the hour, the day, the
 * office at a glance, «Volviste»). New cards pop in, a card that starts
 * needing you hops, and a column's count bumps when it changes.
 */
export function BoardView({
  views,
  actions,
  space,
}: {
  views: AgentView[];
  actions: BoardActions;
  /** The workspace on screen (undefined: "Todos" or no workspaces at all). */
  space?: string;
}) {
  const tint = useDayTint();
  const columns = BOARD_COLUMNS.map((col) => ({
    ...col,
    members: views
      .filter((v) => (col.kinds as readonly string[]).includes(v.kind))
      .sort(col.id === 'needs' ? byUrgency : col.id === 'done' ? byLatest : (a, b) => a.id - b.id),
  }));
  const counts = {
    needs: columns[0].members.length,
    work: columns[1].members.length,
    done: columns[2].members.length,
    idle: columns[3].members.length,
  };
  const calm = useCalmMode();
  const motions = useCardMotions(views);
  return (
    <div
      // pt-52: room for the workspace tabs floating over the top-left corner.
      className="absolute inset-0 overflow-auto p-14 pt-52 pb-80 transition-colors duration-1000"
      style={{ background: `var(${tint})` }}
    >
      <BoardGreeting
        counts={counts}
        firstWaiting={columns[0].members[0]?.id}
        onOpen={actions.onSelect}
      />
      {space && views.length === 0 && <EmptySpace name={space} />}
      <div
        className="grid gap-10 items-start"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}
        // Opening a card is reading what happened: «Volviste» is done.
        onClickCapture={(e) => (e.target as Element).closest('article') && dismissAbsence()}
      >
        {columns.map((col) => {
          const hot = col.id === 'needs' && col.members.length > 0;
          return (
            <section
              key={col.id}
              data-tour={col.id === 'needs' ? 'te-necesita' : undefined}
              className={`flex flex-col gap-8 p-8 rounded-xl border ${
                hot
                  ? 'border-status-permission bg-status-permission-bg'
                  : 'border-border bg-bg-thumb'
              }`}
              aria-label={`${col.title}: ${col.members.length}`}
            >
              <header className="flex items-center gap-7 px-4 pt-2">
                <h2
                  className={`m-0 text-sm font-semibold ${hot ? 'text-status-permission-text' : 'text-text'}`}
                >
                  {col.title}
                </h2>
                <span
                  key={calm ? 'n' : col.members.length}
                  className={`text-2xs font-medium rounded-full px-7 py-1 ${calm ? '' : 'anim-bump'} ${
                    hot ? 'bg-status-permission text-white' : 'bg-bg text-text-muted'
                  }`}
                >
                  {col.members.length}
                </span>
              </header>
              {col.members.length === 0 ? (
                <EmptyColumnLine column={col.id} />
              ) : (
                col.members.map((v) => (
                  <BoardCard key={v.id} view={v} actions={actions} motion={motions.get(v.id)} />
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** A workspace with nobody in it yet. */
function EmptySpace({ name }: { name: string }) {
  return (
    <div className="mb-12 mx-4 soft-panel px-14 py-12 flex items-center gap-10 text-sm text-text-muted">
      <span className="material-symbols-sharp text-xl text-accent" aria-hidden="true">
        workspaces
      </span>
      <span>
        <span className="font-semibold text-text">{name}</span> todavía no tiene agentes. Creá uno
        con «+ Agente» o mové uno desde «Todos».
      </span>
    </div>
  );
}
