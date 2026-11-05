import type { Meeting } from '../../../core/src/messages.js';
import { useNow } from '../hooks/useNow.js';
import {
  formatHour,
  meetingBadge,
  meetingDays,
  type MeetingState,
  meetingState,
} from './meetingsView.js';

const ROW_TINT: Record<MeetingState, string> = {
  live: 'bg-active-bg',
  soon: 'bg-status-permission-bg',
  later: '',
};
const BADGE_TEXT: Record<MeetingState, string> = {
  live: 'text-accent-bright',
  soon: 'text-status-permission-text',
  later: '',
};

function MeetingRow({ meeting, now }: { meeting: Meeting; now: number }) {
  const state = meetingState(meeting, now);
  const badge = meetingBadge(meeting, now);
  // What nothing says you should be at is listed without calling for attention.
  const tint = meeting.quiet ? '' : ROW_TINT[state];
  return (
    <li className={`flex flex-col gap-2 rounded-lg px-6 py-5 ${tint}`}>
      <div className="flex items-baseline justify-between gap-6 text-xs text-text-2 tabular-nums">
        <span>
          {formatHour(meeting.start)} – {formatHour(meeting.end)}
        </span>
        {badge && (
          <span className={`font-semibold ${meeting.quiet ? '' : BADGE_TEXT[state]}`}>{badge}</span>
        )}
      </div>
      <div className="text-sm font-medium text-text line-clamp-2" title={meeting.title}>
        {meeting.title}
      </div>
      {meeting.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Unirse a ${meeting.title}`}
          className="self-start flex items-center gap-3 text-xs font-semibold text-accent-bright no-underline rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="material-symbols-sharp text-sm" aria-hidden="true">
            videocam
          </span>
          Unirse
        </a>
      )}
    </li>
  );
}

/** The next meetings, under the chip at the far left of the office. */
export function MeetingsPanel({
  meetings,
  peek,
  onClose,
}: {
  meetings: Meeting[];
  /** Open by hand over a narrow office: there it has no column of its own. */
  peek: boolean;
  onClose: () => void;
}) {
  const now = useNow();
  const days = meetingDays(meetings, now);
  return (
    <aside
      aria-label="Próximas reuniones"
      className={`absolute left-14 top-52 z-10 w-[260px] max-h-[calc(100%-174px)] flex-col overflow-hidden soft-panel ${
        peek ? 'flex' : 'hidden @min-[760px]:flex'
      }`}
    >
      <header className="flex items-center gap-5 pl-10 pr-4 py-5 border-b border-border">
        <span className="material-symbols-sharp text-sm text-accent" aria-hidden="true">
          event
        </span>
        <h2 className="m-0 flex-1 text-sm font-semibold text-text">Próximas reuniones</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar reuniones"
          title="Cerrar"
          className="w-24 h-24 flex items-center justify-center rounded-md border-0 bg-transparent cursor-pointer text-text-muted hover:bg-btn-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="material-symbols-sharp text-base" aria-hidden="true">
            chevron_left
          </span>
        </button>
      </header>
      {days.length === 0 ? (
        <p className="m-0 px-10 py-12 text-sm text-text-muted">
          No tenés reuniones en los próximos 7 días.
        </p>
      ) : (
        <div className="overflow-y-auto min-h-0 p-5 flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.label} className="flex flex-col gap-3">
              <h3 className="m-0 px-6 text-xs font-semibold text-text-muted first-letter:uppercase">
                {day.label}
              </h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-3">
                {day.meetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
