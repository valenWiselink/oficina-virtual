import { Button } from '../components/ui/Button.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayLog } from '../history/dayLogStore.js';
import { useNow } from '../hooks/useNow.js';
import { type BoardColumnId, dayMoments, emptyLine, localDay } from './boardMood.js';
import { boardGreeting } from './greetingRule.js';
import { useAchieved } from './needsPile.js';
import { cleanDays, dayRecords, useOperatorName } from './officeMemory.js';
import { allDoneBetween } from './officeMoments.js';
import { dismissAbsence, useAbsence } from './presence.js';
import { streakLength } from './streak.js';
import { awaySummary, welcomeLine } from './welcomeBack.js';

/**
 * The line above the columns: a greeting for the hour with your name, one
 * note when there is something to say and the office at a glance, plus the
 * streak — or, back from 45 min away, «Volviste» with what happened and
 * «Ver» for whoever waits first. Which one says what: greetingRule.ts.
 */
export function BoardGreeting({
  counts,
  firstWaiting,
  onOpen,
}: {
  counts: Record<BoardColumnId, number>;
  /** Who waits longest on the board, for «Ver». */
  firstWaiting?: number;
  onOpen: (agentId: number) => void;
}) {
  const now = useNow();
  const date = new Date(now);
  const day = localDay(date);
  const name = useOperatorName();
  const entries = useDayLog();
  const absence = useAbsence(now);
  const away =
    absence &&
    awaySummary(entries, absence.from, absence.to, allDoneBetween(absence.from, absence.to));
  const line = boardGreeting({
    hour: date.getHours(),
    today: day,
    moments: dayMoments(date),
    waiting: counts.needs,
    records: dayRecords(),
    name,
    counts,
    welcome: away ? welcomeLine(away, name, date.getHours()) : null,
  });
  const streak = line.welcome ? 0 : streakLength(cleanDays(), day);
  return (
    <p className="m-0 mb-12 px-4 flex items-center gap-6 text-sm text-text-muted">
      <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
        {line.icon}
      </span>
      <span>
        <span className="font-semibold text-text">{line.title}</span>
        {line.note && <span className="text-accent font-medium"> · {line.note}</span>}
        {line.summary && ` · ${line.summary}`}
        {streak >= 2 && (
          <span
            className="ml-6 inline-flex items-center gap-2 text-text font-medium"
            title="Días hábiles seguidos que cerraste sin nadie esperándote (los findes y feriados no la cortan)"
          >
            <span className="material-symbols-sharp text-xs text-accent" aria-hidden="true">
              local_fire_department
            </span>
            {streak} días seguidos
          </span>
        )}
      </span>
      {line.welcome && firstWaiting !== undefined && (
        <Button
          size="sm"
          onClick={() => {
            dismissAbsence();
            onOpen(firstWaiting);
          }}
        >
          Ver
        </Button>
      )}
    </p>
  );
}

/** An empty column's line: «Al día» for a while after you clear a pile of
 *  "Te necesita" (its ✓ hops, outside calm mode), else the line for the day
 *  and the hour. */
export function EmptyColumnLine({ column }: { column: BoardColumnId }) {
  const now = useNow();
  const calm = useCalmMode();
  const achieved = useAchieved(now);
  if (column === 'needs' && achieved) {
    return (
      <p
        className="m-0 px-4 pb-4 text-xs text-text font-medium flex items-center gap-4"
        role="status"
      >
        <span
          className={`material-symbols-sharp text-sm text-status-success inline-block ${calm ? '' : 'anim-hop'}`}
          aria-hidden="true"
        >
          check
        </span>
        {achieved}
      </p>
    );
  }
  const date = new Date(now);
  return (
    <p className="m-0 px-4 pb-4 text-xs text-text-muted">
      {emptyLine(column, localDay(date), date.getHours())}
    </p>
  );
}
