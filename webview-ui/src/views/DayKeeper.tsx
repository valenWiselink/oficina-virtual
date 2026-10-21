import { useEffect } from 'react';

import { useDayLog } from '../history/dayLogStore.js';
import { daySummary } from '../history/dayLogView.js';
import { useNow } from '../hooks/useNow.js';
import type { AgentView } from './agentViews.js';
import { localDay } from './boardMood.js';
import { useTrackPile } from './needsPile.js';
import { markCleanDay, useRememberDay } from './officeMemory.js';
import { watchPresence } from './presence.js';
import { closesClean } from './streak.js';

/**
 * Draws nothing: keeps today's numbers for tomorrow's greeting ("ayer: …"),
 * marks the day clean for the streak once it closes with nobody waiting,
 * watches the pile of "Te necesita" («Al día», needsPile.ts) and whether
 * you are around («Volviste», presence.ts) — always, whatever view is open.
 */
export function DayKeeper({ views }: { views: AgentView[] }) {
  const date = new Date(useNow());
  const day = localDay(date);
  const summary = daySummary(useDayLog());
  useRememberDay(day, summary);
  const needing = views.filter((v) => v.kind === 'needs').length;
  const clean = closesClean(date.getHours(), summary.tasks + summary.turns, needing);
  useEffect(() => {
    if (clean) markCleanDay(day);
  }, [clean, day]);
  useTrackPile(views);
  useEffect(() => watchPresence(), []);
  return null;
}
