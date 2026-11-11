import type { MomentMeeting } from './asistenteRules.js';

const MINUTE = 60_000;

/**
 * «Reunión»: which one and how far along, «Unirse», that Jarvis keeps quiet,
 * how many asks wait for the end, and that what you write goes as a note.
 */
export function MeetingBanner({
  meeting,
  kept,
  now,
}: {
  /** Undefined when you picked «Reunión» by hand with none under way. */
  meeting: MomentMeeting | undefined;
  /** Asks that wait for the end (they do not hold anyone back). */
  kept: number;
  now: number;
}) {
  const elapsed = meeting ? Math.max(0, Math.round((now - meeting.start) / MINUTE)) : 0;
  const length = meeting ? Math.round((meeting.end - meeting.start) / MINUTE) : 0;
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-10 gap-y-2 px-14 py-6 border-b border-border bg-bg-thumb">
      <span className="material-symbols-sharp text-base text-jarvis" aria-hidden="true">
        groups
      </span>
      <span className="text-xs font-semibold text-text">
        {meeting ? `${meeting.title} · ${elapsed} de ${length} min` : 'En reunión'}
      </span>
      {meeting?.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs text-accent no-underline hover:underline"
        >
          Unirse
        </a>
      )}
      <span className="flex-1" />
      <span className="text-2xs text-text-muted">
        Jarvis callado · {kept > 0 ? `${kept} para después` : 'nada guardado'} · lo que le escribís
        queda como nota de la reunión
      </span>
    </div>
  );
}
