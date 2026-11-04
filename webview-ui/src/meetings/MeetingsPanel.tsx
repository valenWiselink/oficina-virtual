import { useRef, useState } from 'react';

import type { Meeting } from '../../../core/src/messages.js';
import { useNow } from '../hooks/useNow.js';
import {
  setMeetingsMinimized,
  useMeetingsMinimized,
  useUpcomingMeetings,
} from './meetingsStore.js';
import {
  formatHour,
  meetingBadge,
  meetingDays,
  type MeetingState,
  meetingState,
  nextMeeting,
} from './meetingsView.js';

/** Below this office width the board cannot spare the panel's column: only the rail stays. */
const WIDE_PX = 760;

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
  return (
    <li className={`flex flex-col gap-2 rounded-lg px-6 py-5 ${ROW_TINT[state]}`}>
      <div className="flex items-baseline justify-between gap-6 text-2xs text-text-2 tabular-nums">
        <span>
          {formatHour(meeting.start)} – {formatHour(meeting.end)}
        </span>
        {badge && <span className={`font-semibold ${BADGE_TEXT[state]}`}>{badge}</span>}
      </div>
      <div className="text-xs font-medium text-text line-clamp-2" title={meeting.title}>
        {meeting.title}
      </div>
      {meeting.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Unirse a ${meeting.title}`}
          className="self-start flex items-center gap-3 text-2xs font-semibold text-accent-bright no-underline rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="material-symbols-sharp text-xs" aria-hidden="true">
            videocam
          </span>
          Unirse
        </a>
      )}
    </li>
  );
}

/**
 * The next meetings, floating at the far left of the office. Only exists when
 * the server could read the calendar connector: without it, nothing shows.
 * In a narrow office it stays a rail; a click there opens it over the board
 * until you close it.
 */
export function MeetingsPanel() {
  const msg = useUpcomingMeetings();
  const minimized = useMeetingsMinimized();
  const now = useNow();
  // Open by hand over a board too narrow to give it a column.
  const [peek, setPeek] = useState(false);
  const rail = useRef<HTMLButtonElement>(null);

  if (!msg?.connected) return null;

  const open = () => {
    const width = rail.current?.offsetParent?.clientWidth ?? Infinity;
    if (width < WIDE_PX) setPeek(true);
    else setMeetingsMinimized(false);
  };
  const close = () => {
    if (peek) setPeek(false);
    else setMeetingsMinimized(true);
  };

  const days = meetingDays(msg.meetings, now);
  const next = nextMeeting(msg.meetings, now);
  const nextState = next ? meetingState(next, now) : 'later';
  return (
    <>
      {!peek && (
        <button
          ref={rail}
          type="button"
          onClick={open}
          aria-label="Ver tus próximas reuniones"
          title={next ? `${formatHour(next.start)} · ${next.title}` : 'Sin reuniones próximas'}
          className={`absolute left-6 top-52 z-10 w-32 py-7 flex-col items-center gap-3 soft-panel cursor-pointer text-text-2 hover:bg-btn-hover focus-visible:outline-2 focus-visible:outline-accent ${
            minimized ? 'flex' : 'flex @min-[760px]:hidden'
          } ${ROW_TINT[nextState]}`}
        >
          <span className="material-symbols-sharp text-base" aria-hidden="true">
            event
          </span>
          {next && (
            <span className="text-[9px] font-semibold tabular-nums leading-none">
              {formatHour(next.start)}
            </span>
          )}
        </button>
      )}
      {(peek || !minimized) && (
        <aside
          aria-label="Próximas reuniones"
          className={`absolute left-14 top-52 z-10 w-[216px] max-h-[calc(100%-174px)] flex-col overflow-hidden soft-panel ${
            peek ? 'flex' : 'hidden @min-[760px]:flex'
          }`}
        >
          <header className="flex items-center gap-5 pl-10 pr-4 py-5 border-b border-border">
            <span className="material-symbols-sharp text-sm text-accent" aria-hidden="true">
              event
            </span>
            <h2 className="m-0 flex-1 text-xs font-semibold text-text">Próximas reuniones</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Minimizar reuniones"
              title="Minimizar"
              className="w-24 h-24 flex items-center justify-center rounded-md border-0 bg-transparent cursor-pointer text-text-muted hover:bg-btn-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="material-symbols-sharp text-base" aria-hidden="true">
                chevron_left
              </span>
            </button>
          </header>
          {days.length === 0 ? (
            <p className="m-0 px-10 py-12 text-xs text-text-muted">
              No tenés reuniones en los próximos 7 días.
            </p>
          ) : (
            <div className="overflow-y-auto min-h-0 p-5 flex flex-col gap-6">
              {days.map((day) => (
                <section key={day.label} className="flex flex-col gap-3">
                  <h3 className="m-0 px-6 text-2xs font-semibold text-text-muted first-letter:uppercase">
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
      )}
    </>
  );
}
