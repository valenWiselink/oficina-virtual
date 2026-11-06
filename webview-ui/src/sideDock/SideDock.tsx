import type { ReactNode } from 'react';

import { MeetingsPanel } from '../meetings/MeetingsPanel.js';
import {
  closeMeetingsList,
  useMeetingsMinimized,
  useMeetingsPeek,
  useUpcomingMeetings,
} from '../meetings/meetingsStore.js';
import { dockClasses, dockShape } from './sideDockRules.js';

/** In the stacked column the list keeps to its size; side by side, its own 260px. */
const MEETINGS_BOTH =
  'min-h-0 max-h-[40%] flex-col @min-[1280px]:w-[260px] @min-[1280px]:max-h-full';
const PANEL_BOTH = 'flex-1 min-h-0 min-w-0 flex @min-[1280px]:flex-none @min-[1280px]:w-[380px]';

/**
 * The office's left column: the panel open on purpose (Pendientes, Historial,
 * Artifacts) and the list of meetings, side by side with the board instead of
 * over it — the board, the tabs and Jarvis take the room that is left.
 */
export function SideDock({ panel, meetings }: { panel: ReactNode; meetings: boolean }) {
  const msg = useUpcomingMeetings();
  const minimized = useMeetingsMinimized();
  const peek = useMeetingsPeek();
  const listOpen = meetings && !!msg?.connected && (peek || !minimized);
  const shape = dockShape(!!panel, listOpen);
  if (shape === 'none') return null;

  const list =
    listOpen && msg ? <MeetingsPanel meetings={msg.meetings} onClose={closeMeetingsList} /> : null;
  return (
    <div className={dockClasses(shape, peek)}>
      {shape === 'both' && (
        <div className={`${MEETINGS_BOTH} ${peek ? 'flex' : 'hidden @min-[760px]:flex'}`}>
          {list}
        </div>
      )}
      {shape === 'meetings' && list}
      {panel && (
        <div className={shape === 'both' ? PANEL_BOTH : 'flex-1 min-h-0 flex'}>{panel}</div>
      )}
    </div>
  );
}
