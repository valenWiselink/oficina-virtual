import { useEffect, useRef, useState } from 'react';

import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { Button } from '../components/ui/Button.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayLog } from '../history/dayLogStore.js';
import { daySummary, summaryLine } from '../history/dayLogView.js';
import { shortPr } from '../history/prRows.js';
import { useNow } from '../hooks/useNow.js';
import { useTellMerged } from '../identity/mergeToldStore.js';
import { playCheerSound } from '../notificationSound.js';
import { onPrMerged, prStatusOf } from '../prs/prStatusStore.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import type { AgentView } from './agentViews.js';
import { localDay } from './boardMood.js';
import { TellMergedButton } from './CardExtras.js';
import { requestCelebration } from './celebrate.js';
import { allFinished, isBusy } from './officeMoments.js';

/** The evening summary shows once a day, from this hour. */
const SUMMARY_HOUR = 18;
const SUMMARY_KEY = 'oficina.resumen';
/** "Terminaron todos" at most this often. */
const ALL_DONE_EVERY_MS = 10 * 60_000;
const ALL_DONE_SHOWN_MS = 8000;

interface Cheer {
  id: 'todos' | 'resumen' | 'pr';
  title: string;
  text: string;
  palette: number;
  hueShift: number;
  /** The agent it is about (a merged PR's), for "Avisarle". */
  agentId?: number;
}

/**
 * The office's little moments, as a note above the toolbar: when every
 * agent has finished ("Terminaron todos"), and once a day from 18 h a summary
 * of what got done; when one of their PRs gets merged, its agent celebrates
 * too. Never in calm mode.
 */
export function OfficeCheers({
  views,
  onOpenHistory,
}: {
  views: AgentView[];
  onOpenHistory: () => void;
}) {
  const calm = useCalmMode();
  const now = useNow();
  const entries = useDayLog();
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const wasBusy = useRef<boolean | null>(null);
  const lastAllDone = useRef(0);

  const viewsRef = useRef(views);
  viewsRef.current = views;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  useEffect(
    () =>
      onPrMerged((url) => {
        const agent = viewsRef.current.find((v) => v.prUrl === url || v.mergedPr?.url === url);
        if (agent) requestCelebration(agent.id);
        void playCheerSound();
        if (calmRef.current) return;
        setCheer({
          id: 'pr',
          title: '¡Se mergeó!',
          text: `${prStatusOf(url)?.title ?? shortPr(url)}${agent ? ` · de ${agent.name}` : ''}`,
          palette: agent?.palette ?? 0,
          hueShift: agent?.hueShift ?? 0,
          agentId: agent?.id,
        });
      }),
    [],
  );

  const busy = views.some(isBusy);
  useEffect(() => {
    const before = wasBusy.current;
    wasBusy.current = busy;
    if (calm || before === null || !allFinished(before, views)) return;
    if (Date.now() - lastAllDone.current < ALL_DONE_EVERY_MS) return;
    lastAllDone.current = Date.now();
    setCheer({
      id: 'todos',
      title: 'Terminaron todos',
      text: 'Nadie está trabajando ni te espera. Andá a estirar las piernas.',
      palette: 0,
      hueShift: 0,
    });
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cheer?.id !== 'todos' && cheer?.id !== 'pr') return;
    const timer = setTimeout(() => setCheer(null), ALL_DONE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [cheer]);

  useEffect(() => {
    const date = new Date(now);
    if (calm || cheer || date.getHours() < SUMMARY_HOUR) return;
    const today = String(localDay(date));
    if (readSeen() === today) return;
    const summary = daySummary(entries);
    if (summary.tasks + summary.turns === 0) return;
    writeSeen(today);
    const star = views.find((v) => v.id === summary.star?.agentId);
    setCheer({
      id: 'resumen',
      title: 'Así fue tu día',
      text: `${summaryLine(summary)}.${summary.star ? ` El que más laburó: ${summary.star.agent}.` : ''}`,
      palette: star?.palette ?? 0,
      hueShift: star?.hueShift ?? 0,
    });
  }, [now, calm, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cheer) return null;
  // Its "te toca" may have been settled by this merge (mergedAsk.ts).
  const about = views.find((v) => v.id === cheer.agentId);
  const told = cheer.id === 'pr' && about?.mergedPr?.told;
  return (
    <div
      role="status"
      className="anim-float-up absolute left-1/2 -translate-x-1/2 bottom-72 z-40 soft-panel flex items-center gap-10 py-8 pl-10 pr-6 max-w-[min(440px,calc(100%-32px))]"
    >
      <span className="anim-cheer shrink-0">
        <CharacterMugShot palette={cheer.palette} hueShift={cheer.hueShift} size={36} />
      </span>
      <span className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-semibold text-text">{cheer.title}</span>
        <span className="text-xs text-text-muted">
          {cheer.text}
          {told && ' · ya se enteró'}
        </span>
      </span>
      {cheer.id === 'pr' && about && <TellFromCheer view={about} />}
      {cheer.id === 'resumen' && (
        <Button
          size="sm"
          onClick={() => {
            setCheer(null);
            onOpenHistory();
          }}
        >
          Ver el día
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label="Cerrar"
        title="Cerrar"
        onClick={() => setCheer(null)}
      >
        ×
      </Button>
    </div>
  );
}

/** "Avisarle" in the merge celebration, when the card would offer it. */
function TellFromCheer({ view }: { view: AgentView }) {
  const writable = useWritableAgents().has(view.id);
  return useTellMerged(view.mergedPr, writable) ? <TellMergedButton view={view} /> : null;
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SUMMARY_KEY);
  } catch {
    return null;
  }
}

function writeSeen(day: string): void {
  try {
    localStorage.setItem(SUMMARY_KEY, day);
  } catch {
    /* blocked storage: it may show again on reload */
  }
}
