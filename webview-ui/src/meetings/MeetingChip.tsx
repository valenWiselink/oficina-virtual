import { useEffect } from 'react';

import type { Meeting } from '../../../core/src/messages.js';
import { useNow } from '../hooks/useNow.js';
import { dismissMeeting, useDismissedMeetings } from './meetingsStore.js';
import {
  type ChipLevel,
  formatHour,
  meetingChip,
  meetingKey,
  meetingToast,
} from './meetingsView.js';

const LOOK: Record<ChipLevel, string> = {
  now: 'bg-meeting-now text-meeting-now-text border-meeting-now',
  soon: 'bg-status-permission-bg text-status-permission-text border-status-permission',
  calm: 'bg-bg-thumb/90 text-text border-border',
};
const JOIN: Record<ChipLevel, string> = {
  now: 'bg-meeting-now-text text-meeting-now',
  soon: 'bg-status-permission text-white',
  calm: 'bg-bg text-accent-bright',
};

/** Toasts already sent this session (one per moment of each meeting). */
const toasted = new Set<string>();

/**
 * Windows' notice, only with the office out of view: there the chip cannot be
 * seen. Silent, whatever the sound settings: nobody asked for a noise.
 */
function toastDue(meetings: Meeting[], now: number, dismissed: readonly string[]): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  for (const meeting of meetings) {
    if (dismissed.includes(meetingKey(meeting))) continue;
    const toast = meetingToast(meeting, now);
    if (!toast || toasted.has(toast.key)) continue;
    toasted.add(toast.key);
    try {
      const notice = new Notification(toast.title, {
        body: toast.body,
        tag: `oficina-reunion-${toast.key}`,
        silent: true,
      });
      notice.onclick = () => {
        window.focus();
        notice.close();
      };
    } catch {
      /* a blocked or unsupported toast must never break the office */
    }
  }
}

/**
 * The next meeting, in the row of the workspace tabs and as tall as they are.
 * Painted with «Unirse» while you should be in it, until it ends or you dismiss
 * it; a countdown from 15 minutes before; otherwise when and what is next. With
 * nothing ahead, only the icon that opens the list. A click opens the list.
 */
export function MeetingChip({
  meetings,
  open,
  onToggle,
}: {
  meetings: Meeting[];
  open: boolean;
  onToggle: () => void;
}) {
  const now = useNow();
  const dismissed = useDismissedMeetings();
  useEffect(() => toastDue(meetings, now, dismissed), [meetings, now, dismissed]);

  const chip = meetingChip(meetings, now, (key) => dismissed.includes(key));
  if (!chip) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Ver tus reuniones"
        title="Sin reuniones próximas"
        className="pointer-events-auto shrink-0 self-stretch w-34 flex items-center justify-center rounded-xl border border-border bg-bg-thumb/90 text-text-muted cursor-pointer hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="material-symbols-sharp text-base" aria-hidden="true">
          event
        </span>
      </button>
    );
  }
  const { level, meeting, when, alsoNow, joinable } = chip;
  const painted = level === 'now';
  const others = alsoNow.map((m) => m.title).join(', ');
  const hours = `${formatHour(meeting.start)} a ${formatHour(meeting.end)}`;
  return (
    <div
      className={`pointer-events-auto shrink-0 self-stretch min-w-0 max-w-[min(520px,70%)] flex items-center rounded-xl border ${LOOK[level]}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${when}: ${meeting.title}. Ver tus reuniones`}
        title={`${meeting.title} · ${hours}${others ? ` · También: ${others}` : ''}`}
        className="min-w-0 h-full flex items-center gap-6 pl-8 pr-8 border-0 bg-transparent text-inherit rounded-xl cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          className={`material-symbols-sharp text-base shrink-0 ${painted ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        >
          {painted ? 'videocam' : 'event'}
        </span>
        <span className="text-sm font-semibold whitespace-nowrap tabular-nums">{when}</span>
        <span className="hidden @min-[520px]:inline min-w-0 truncate text-sm font-medium">
          {meeting.title}
        </span>
        {alsoNow.length > 0 && (
          <span className="shrink-0 text-2xs font-semibold tabular-nums">+{alsoNow.length}</span>
        )}
      </button>
      {joinable && meeting.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Unirse a ${meeting.title}`}
          className={`shrink-0 mr-3 px-10 py-2 rounded-lg text-sm font-semibold no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent ${JOIN[level]}`}
        >
          Unirse
        </a>
      )}
      {painted && (
        <button
          type="button"
          onClick={() => dismissMeeting(meetingKey(meeting))}
          aria-label={`Dejar de resaltar ${meeting.title}`}
          title="Ya sé: dejar de resaltarla"
          className="shrink-0 w-26 h-full flex items-center justify-center border-0 bg-transparent text-inherit rounded-xl cursor-pointer hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="material-symbols-sharp text-base" aria-hidden="true">
            close
          </span>
        </button>
      )}
    </div>
  );
}
