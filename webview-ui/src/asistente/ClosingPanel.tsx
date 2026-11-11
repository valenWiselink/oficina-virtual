import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { DayStoryView } from '../history/DayStoryView.js';
import { whenText } from '../now/nowTime.js';
import type { NowModel } from '../now/useNowQueue.js';
import { transport } from '../transport/index.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { toClose } from '../views/controlRules.js';

/** What is left for tomorrow: what still waits, and what was put off. */
function LeftForTomorrow({ model }: { model: NowModel }) {
  const { queue, now } = model;
  const waiting = [...(queue.first ? [queue.first] : []), ...queue.next];
  if (waiting.length === 0 && queue.later.length === 0) {
    return <p className="m-0 text-xs text-text-muted">No queda nada pendiente.</p>;
  }
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-4">
      {waiting.map(({ ask }) => (
        <li key={ask.id} className="text-xs text-text break-words">
          <span className="font-mono text-2xs text-accent">{ask.id}</span> {ask.text}
          <span className="text-text-muted"> · {ask.from}</span>
        </li>
      ))}
      {queue.later.map(({ ask, times }) => (
        <li key={ask.id} className="text-xs text-text break-words">
          <span className="font-mono text-2xs text-text-muted">
            {times.notBefore !== undefined ? whenText(times.notBefore, now) : ''}
          </span>{' '}
          {ask.text}
        </li>
      ))}
    </ul>
  );
}

/** Close the agents that finished and are no longer needed, after one confirmation. */
function CloseFinished({ spare }: { spare: AgentView[] }) {
  const [confirming, setConfirming] = useState(false);
  const names = spare.map((v) => `«${v.name}»`).join(', ');
  if (!confirming) {
    return (
      <Button size="sm" className="self-start" title={names} onClick={() => setConfirming(true)}>
        {spare.length === 1
          ? `Cerrar a «${spare[0].name}», que terminó`
          : `Cerrar los ${spare.length} que terminaron`}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-6 rounded-md border border-border px-8 py-7">
      <span className="text-xs text-text">
        Se cierran {names}. Sus conversaciones quedan guardadas.
      </span>
      <span className="flex gap-6">
        <Button
          size="sm"
          variant="accent"
          onClick={() => {
            for (const v of spare) transport.send({ type: 'closeAgent', id: v.id });
            setConfirming(false);
          }}
        >
          Cerrar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

/**
 * «Cierre del día»: what got done (by project, with the summary Haiku can
 * write), what is left for tomorrow, and the agents that finished and are no
 * longer needed, closed in one go (their conversations stay saved).
 */
export function ClosingPanel({
  views,
  actions,
  model,
}: {
  views: AgentView[];
  actions: BoardActions;
  model: NowModel;
}) {
  const spare = views.filter(toClose);
  return (
    <section
      aria-label="Cierre del día"
      className="w-full h-full soft-panel flex flex-col gap-10 overflow-y-auto py-10"
    >
      <div className="px-12 flex flex-col gap-6">
        <h2 className="m-0 text-2xs font-semibold uppercase tracking-wide text-text-muted">
          Queda para mañana
        </h2>
        <LeftForTomorrow model={model} />
        {spare.length > 0 && actions.onClose && <CloseFinished spare={spare} />}
      </div>
      <h2 className="m-0 px-12 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Lo que se hizo hoy
      </h2>
      <DayStoryView views={views} onOpenAgent={actions.onSelect} />
    </section>
  );
}
