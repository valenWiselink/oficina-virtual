import { type ReactNode, useRef } from 'react';

import { MeetingChip } from './MeetingChip.js';
import {
  setMeetingsMinimized,
  setMeetingsPeek,
  useMeetingsMinimized,
  useMeetingsPeek,
  useUpcomingMeetings,
} from './meetingsStore.js';

/** Below this office width the list does not stay by itself: it opens by hand. */
const WIDE_PX = 760;

/**
 * The row at the top of the office: the workspace tabs and, beside them and as
 * tall as they are, the next meeting. The chip opens the list of meetings in
 * the office's left column (SideDock); in a narrow office only by hand, until
 * you close it. Without the calendar connector the row is only the tabs.
 */
export function OfficeTopRow({ bar, meetings }: { bar: ReactNode; meetings: boolean }) {
  const msg = useUpcomingMeetings();
  const minimized = useMeetingsMinimized();
  const peek = useMeetingsPeek();
  const row = useRef<HTMLDivElement>(null);
  const connected = meetings && !!msg?.connected;
  // The office region (the @container), not the room the column leaves.
  const wide = () => {
    const office = row.current?.closest<HTMLElement>('.\\@container');
    return (office?.clientWidth ?? Infinity) >= WIDE_PX;
  };
  const toggle = () => {
    if (peek || !wide()) setMeetingsPeek(!peek);
    else setMeetingsMinimized(!minimized);
  };
  if (!bar && !(connected && msg)) return null;

  return (
    <div
      ref={row}
      className="absolute left-14 right-14 top-10 z-10 flex items-stretch gap-8 pointer-events-none"
    >
      {bar}
      {connected && msg && (
        <MeetingChip meetings={msg.meetings} open={peek || !minimized} onToggle={toggle} />
      )}
    </div>
  );
}
