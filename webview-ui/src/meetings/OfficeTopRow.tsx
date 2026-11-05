import { type ReactNode, useRef, useState } from 'react';

import { MeetingChip } from './MeetingChip.js';
import { MeetingsPanel } from './MeetingsPanel.js';
import {
  setMeetingsMinimized,
  useMeetingsMinimized,
  useUpcomingMeetings,
} from './meetingsStore.js';

/** Below this office width the board cannot spare the list's column: it opens over it. */
const WIDE_PX = 760;

/**
 * The row at the top of the office: the workspace tabs and, beside them and as
 * tall as they are, the next meeting. The list of meetings opens under it at
 * the far left; in a narrow office, over the board until you close it. Without
 * the calendar connector the row is only the tabs.
 */
export function OfficeTopRow({ bar, meetings }: { bar: ReactNode; meetings: boolean }) {
  const msg = useUpcomingMeetings();
  const minimized = useMeetingsMinimized();
  // Open by hand over a board too narrow to give it a column.
  const [peek, setPeek] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const connected = meetings && !!msg?.connected;
  const wide = () => {
    const parent = row.current?.offsetParent;
    return (parent?.clientWidth ?? Infinity) >= WIDE_PX;
  };

  const close = () => {
    if (peek) setPeek(false);
    else setMeetingsMinimized(true);
  };
  const toggle = () => {
    if (peek || !wide()) setPeek((p) => !p);
    else setMeetingsMinimized(!minimized);
  };

  return (
    <>
      <div
        ref={row}
        className="absolute left-14 right-14 top-10 z-10 flex items-stretch gap-8 pointer-events-none"
      >
        {bar}
        {connected && msg && (
          <MeetingChip meetings={msg.meetings} open={peek || !minimized} onToggle={toggle} />
        )}
      </div>
      {connected && msg && (peek || !minimized) && (
        <MeetingsPanel meetings={msg.meetings} peek={peek} onClose={close} />
      )}
    </>
  );
}
