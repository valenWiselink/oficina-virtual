import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { useNow } from '../hooks/useNow.js';
import { type AgentView, BOARD_COLUMNS, byUrgency } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { dayNote, emptyLine, greeting, localDay, officeSummary } from './boardMood.js';
import { useCardMotions } from './cardMotion.js';
import { cleanDays, dayRecord, useOperatorName, yesterdayLine } from './officeMemory.js';
import { streakLength } from './streak.js';

/**
 * Agents grouped by what they need from you: "Te necesita" first (permission
 * or a question), then working, finished and without a task. A card moves
 * column as soon as its state changes. "Te necesita" puts what blocks an
 * agent first and the longest wait on top; the other columns keep id order.
 * Above them, a greeting for the hour (and the day, when it is a special
 * one) with the office at a glance. New cards pop in, a card that starts
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
  const date = new Date(useNow());
  const columns = BOARD_COLUMNS.map((col) => ({
    ...col,
    members: views
      .filter((v) => (col.kinds as readonly string[]).includes(v.kind))
      .sort(col.id === 'needs' ? byUrgency : (a, b) => a.id - b.id),
  }));
  const hello = greeting(date.getHours());
  const summary = officeSummary({
    needs: columns[0].members.length,
    work: columns[1].members.length,
    done: columns[2].members.length,
    idle: columns[3].members.length,
  });
  const day = localDay(date);
  const name = useOperatorName();
  const streak = streakLength(cleanDays(), day);
  // Mornings recall yesterday, unless the day itself has something to say.
  const note =
    dayNote(date) ?? (date.getHours() < 12 ? yesterdayLine(dayRecord(day - 1)) : undefined);
  const calm = useCalmMode();
  const motions = useCardMotions(views);
  return (
    <div
      // pt-52: room for the workspace tabs floating over the top-left corner.
      className="absolute inset-0 overflow-auto p-14 pt-52 pb-80 transition-colors duration-1000"
      style={{ background: `var(${tint})` }}
    >
      <p className="m-0 mb-12 px-4 flex items-center gap-6 text-sm text-text-muted">
        <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
          {hello.icon}
        </span>
        <span>
          <span className="font-semibold text-text">
            {hello.text}
            {name && `, ${name}`}
          </span>
          {note && <span className="text-accent font-medium"> · {note}</span>} · {summary}
          {streak >= 2 && (
            <span
              className="ml-6 inline-flex items-center gap-2 text-text font-medium"
              title="Días seguidos que cerraste sin nadie esperándote"
            >
              <span className="material-symbols-sharp text-xs text-accent" aria-hidden="true">
                local_fire_department
              </span>
              {streak} días seguidos
            </span>
          )}
        </span>
      </p>
      {space && views.length === 0 && <EmptySpace name={space} />}
      <div
        className="grid gap-10 items-start"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}
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
                <p className="m-0 px-4 pb-4 text-xs text-text-muted">{emptyLine(col.id, day)}</p>
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
