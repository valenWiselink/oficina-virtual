import { useRef, useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { AskButtons, type JarvisLink } from '../now/AskActions.js';
import { usePrimaryAction } from '../now/askHooks.js';
import type { Ranked } from '../now/nowRules.js';
import type { MeetingTime } from '../now/nowTime.js';
import { askWhen } from '../pendingAsks/pendingAsksView.js';
import { swipeOf } from './asistenteRules.js';

type Entry = Ranked<PendingAskEntry>;

/** One card, swipeable: right does the main thing, left goes to the next. */
function SwipeCard({
  entry,
  now,
  meetings,
  jarvis,
  onNext,
}: {
  entry: Entry;
  now: number;
  meetings: readonly MeetingTime[];
  jarvis?: JarvisLink;
  onNext: () => void;
}) {
  const { ask, reasons } = entry;
  const primary = usePrimaryAction(ask, jarvis);
  const from = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <article
      aria-label={ask.text}
      className="flex flex-col gap-6 rounded-xl border-2 border-accent bg-bg px-12 py-10 touch-pan-y select-none"
      style={{ transform: `translateX(${dx}px) rotate(${dx / 40}deg)` }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input')) return;
        from.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (from.current) setDx(e.clientX - from.current.x);
      }}
      onPointerUp={(e) => {
        const start = from.current;
        from.current = null;
        setDx(0);
        if (!start) return;
        const swipe = swipeOf(e.clientX - start.x, e.clientY - start.y);
        if (swipe === 'right') primary?.run();
        else if (swipe === 'left') onNext();
      }}
      onPointerCancel={() => {
        from.current = null;
        setDx(0);
      }}
    >
      <div className="flex items-baseline gap-6">
        <span className="text-2xs font-mono text-accent">{ask.id}</span>
        <span className="flex-1 min-w-0 text-2xs text-text-muted truncate">
          {ask.from} · {askWhen(ask.at, now)}
        </span>
      </div>
      <p className="m-0 text-base font-semibold leading-snug text-text break-words">{ask.text}</p>
      {(ask.why ?? reasons[0]) && (
        <p className="m-0 text-2xs text-text-2">{ask.why ?? reasons[0]}</p>
      )}
      <AskButtons ask={ask} now={now} meetings={meetings} jarvis={jarvis} />
      <p className="m-0 flex justify-between text-2xs text-text-muted">
        <span>← siguiente</span>
        <span>{primary ? `${primary.label.toLowerCase()} →` : 'el merge, con su botón'}</span>
      </p>
    </article>
  );
}

/**
 * A narrow window: what waits on you one card at a time, the most urgent
 * first. Swipe right for its main answer (never a merge), left for the next
 * one; its buttons are all there too.
 */
export function DecisionStack({
  waiting,
  now,
  meetings,
  jarvis,
}: {
  waiting: Entry[];
  now: number;
  meetings: readonly MeetingTime[];
  jarvis?: JarvisLink;
}) {
  const [index, setIndex] = useState(0);
  if (waiting.length === 0) return null;
  const at = index % waiting.length;
  const entry = waiting[at];
  return (
    <section aria-label="Decisiones" className="mx-10 mb-6 flex flex-col gap-4">
      <span className="text-2xs text-text-muted">
        {at + 1} de {waiting.length}
      </span>
      <SwipeCard
        key={entry.ask.id}
        entry={entry}
        now={now}
        meetings={meetings}
        jarvis={jarvis}
        onNext={() => setIndex((i) => i + 1)}
      />
    </section>
  );
}
