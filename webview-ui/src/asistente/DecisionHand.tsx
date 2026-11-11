import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { AskButtons, type JarvisLink } from '../now/AskActions.js';
import type { Ranked } from '../now/nowRules.js';
import type { MeetingTime } from '../now/nowTime.js';
import { askWhen } from '../pendingAsks/pendingAsksView.js';
import { HAND_SHOWN, handOf } from './asistenteRules.js';

type Entry = Ranked<PendingAskEntry>;

/** One decision: why now, what, and the buttons that settle it. */
function DecisionCard({
  entry,
  first,
  now,
  meetings,
  jarvis,
}: {
  entry: Entry;
  first: boolean;
  now: number;
  meetings: readonly MeetingTime[];
  jarvis?: JarvisLink;
}) {
  const { ask, reasons } = entry;
  const why = ask.why ?? reasons[0];
  return (
    <article
      aria-label={ask.text}
      className={`min-w-0 flex flex-col gap-6 rounded-lg bg-bg px-10 py-8 border ${
        first ? 'border-2 border-accent' : 'border-border-strong'
      }`}
    >
      <div className="flex items-baseline gap-6 min-w-0">
        <span className="text-2xs font-mono text-accent shrink-0">{ask.id}</span>
        <span className="flex-1 min-w-0 text-2xs text-text-muted truncate">
          {ask.from} · {askWhen(ask.at, now)}
        </span>
      </div>
      <p className="m-0 text-sm font-semibold leading-snug text-text break-words line-clamp-3">
        {ask.text}
      </p>
      {why && <p className="m-0 text-2xs text-text-2 line-clamp-2">{why}</p>}
      {ask.ifNot && <p className="m-0 text-2xs text-text-muted line-clamp-2">Si no: {ask.ifNot}</p>}
      <AskButtons ask={ask} now={now} meetings={meetings} jarvis={jarvis} />
    </article>
  );
}

/**
 * What waits on you, as cards right above Jarvis's box — never over what you
 * write. The most urgent first (nowRules), three in sight, the rest behind
 * «y N más». Each settles in one tap: Mergear, Sí / No, Hecho, Posponer,
 * Responder.
 */
export function DecisionHand({
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
  const [all, setAll] = useState(false);
  if (waiting.length === 0) return null;
  const { shown, more } = handOf(waiting, all);
  return (
    <section
      aria-label="Decisiones"
      className="mx-10 mb-6 flex flex-col gap-6 max-h-[55%] overflow-y-auto"
    >
      <div className="grid gap-8 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {shown.map((entry, i) => (
          <DecisionCard
            key={entry.ask.id}
            entry={entry}
            first={i === 0}
            now={now}
            meetings={meetings}
            jarvis={jarvis}
          />
        ))}
      </div>
      {(all ? waiting.length > HAND_SHOWN : more > 0) && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="self-start border-0 bg-transparent p-0 text-2xs text-accent cursor-pointer hover:underline"
        >
          {all ? 'Mostrar menos' : `y ${more} más`}
        </button>
      )}
    </section>
  );
}
