import type { ReactNode } from 'react';

import { useArtifacts } from '../artifacts/artifactsStore.js';
import { artifactAuthor } from '../artifacts/artifactsView.js';
import { whenText } from '../now/nowTime.js';
import type { NowModel } from '../now/useNowQueue.js';
import { ClosedAsk, SeemsDoneAsk } from '../pendingAsks/PendingAsksPanel.js';

const DAY = 24 * 3_600_000;
const ARTIFACTS_SHOWN = 3;

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h3 className="m-0 px-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The rest of today: meetings and asks with a time, soonest first. */
function Today({ model }: { model: NowModel }) {
  if (model.strip.length === 0) {
    return <p className="m-0 px-2 text-xs text-text-muted">Nada más con hora por hoy.</p>;
  }
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-4">
      {model.strip.map((item) => (
        <li
          key={item.key}
          className={`rounded-md border px-8 py-6 flex flex-col gap-1 ${
            item.kind === 'meeting' ? 'border-border bg-bg-thumb' : 'border-border'
          } ${item.hot ? 'border-status-permission!' : ''}`}
        >
          <span className="text-2xs font-mono text-text-muted">
            {item.when}
            {item.soon ? ` · ${item.soon}` : ''}
          </span>
          <span className="text-xs text-text break-words">{item.label}</span>
          {item.joinUrl && (
            <a
              href={item.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xs text-accent no-underline hover:underline"
            >
              Unirse
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** What is for another moment: «mañana 9:00», after the demo. */
function Later({ model }: { model: NowModel }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-4">
      {model.queue.later.map(({ ask, times }) => (
        <li key={ask.id} className="rounded-md border border-dashed border-border px-8 py-6">
          <span className="block text-2xs font-mono text-text-muted">
            {times.notBefore !== undefined ? whenText(times.notBefore, model.now) : ''}
            {ask.after ? ` · después de ${ask.after}` : ''}
          </span>
          <span className="block text-xs text-text break-words line-clamp-3">{ask.text}</span>
          <span className="block text-2xs text-text-muted">{ask.from}</span>
        </li>
      ))}
    </ul>
  );
}

/** What the agents published today: a click opens it in the browser. */
function PublishedToday({ now }: { now: number }) {
  const list = useArtifacts();
  const today = (list?.artifacts ?? [])
    .filter((a) => now - a.at < DAY)
    .sort((a, b) => b.at - a.at)
    .slice(0, ARTIFACTS_SHOWN);
  if (today.length === 0) return null;
  return (
    <Part title="Publicado hoy">
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {today.map((a) => (
          <li key={a.id}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md px-6 py-4 no-underline hover:bg-bg-thumb"
              title={`Abrir «${a.title}» en el navegador`}
            >
              <span className="block text-xs text-text truncate">{a.title}</span>
              <span className="block text-2xs text-text-muted truncate">{artifactAuthor(a)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/**
 * «Lo que viene»: the rest of today, what is for later (with its day and
 * the meeting it waits for), what you already answered or looks done, what
 * the agents published today, and what was closed.
 */
export function ComingColumn({ model }: { model: NowModel }) {
  const { now, seemsDone, closed, queue } = model;
  return (
    <aside
      aria-label="Lo que viene"
      className="w-full h-full soft-panel flex flex-col gap-14 overflow-y-auto px-10 py-10"
    >
      <Part title="Hoy">
        <Today model={model} />
      </Part>
      {queue.later.length > 0 && (
        <Part title={`Más tarde (${queue.later.length})`}>
          <Later model={model} />
        </Part>
      )}
      {seemsDone.length > 0 && (
        <Part title={`Respondido o parece resuelto (${seemsDone.length})`}>
          <ul className="m-0 p-0 list-none">
            {seemsDone.map((ask) => (
              <SeemsDoneAsk key={ask.id} ask={ask} now={now} />
            ))}
          </ul>
        </Part>
      )}
      <PublishedToday now={now} />
      {closed.length > 0 && (
        <details className="px-2">
          <summary className="text-2xs font-semibold uppercase tracking-wide text-text-muted cursor-pointer">
            Cerrados ({closed.length})
          </summary>
          <ul className="m-0 p-0 pt-4 list-none">
            {closed.map((ask) => (
              <ClosedAsk key={ask.id} ask={ask} now={now} />
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
