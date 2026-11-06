import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { useNow } from '../hooks/useNow.js';
import {
  closePendingAsk,
  keepPendingAsk,
  reopenPendingAsk,
  usePendingAsks,
} from './pendingAsksStore.js';
import { askWhen, splitOpen } from './pendingAsksView.js';

const COPIED_MS = 1500;

/** Copies the command an ask brings, and says so for a moment. */
function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    const done = (next: 'copied' | 'failed') => {
      setState(next);
      setTimeout(() => setState('idle'), COPIED_MS);
    };
    void navigator.clipboard
      .writeText(command)
      .then(() => done('copied'))
      .catch(() => done('failed'));
  };
  const label = { idle: 'Copiar comando', copied: 'Copiado', failed: 'No se pudo copiar' }[state];
  return (
    <Button size="sm" onClick={copy} title={command}>
      {label}
    </Button>
  );
}

function OpenAsk({ ask, now }: { ask: PendingAskEntry; now: number }) {
  return (
    <li className="flex flex-col gap-4 px-6 py-7 border-b border-border last:border-b-0">
      <div className="text-2xs text-text-muted">
        <span className="font-semibold text-text-2">{ask.from}</span> · {askWhen(ask.at, now)}
      </div>
      <div className="text-sm text-text break-words">{ask.text}</div>
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <Button size="sm" onClick={() => closePendingAsk(ask.id)}>
          Hecho
        </Button>
        {ask.command && <CopyCommand command={ask.command} />}
      </div>
    </li>
  );
}

/** One that looks done (its PR merged, the agent waiting for it closed): one
 *  click closes it, the other keeps it. */
function SeemsDoneAsk({ ask, now }: { ask: PendingAskEntry; now: number }) {
  return (
    <li className="flex flex-col gap-3 px-6 py-6 border-b border-border last:border-b-0">
      <span className="text-xs text-text-2 break-words">{ask.text}</span>
      <span className="text-2xs text-text-muted">
        {ask.from} · {askWhen(ask.at, now)} ·{' '}
        <span className="text-status-success">{ask.seemsDone}</span>
      </span>
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <Button size="sm" onClick={() => closePendingAsk(ask.id)}>
          Cerrar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => keepPendingAsk(ask.id)}>
          Sigue pendiente
        </Button>
      </div>
    </li>
  );
}

function ClosedAsk({ ask, now }: { ask: PendingAskEntry; now: number }) {
  return (
    <li className="flex items-start gap-8 px-6 py-5">
      <span className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-xs text-text-2 break-words">{ask.text}</span>
        <span className="text-2xs text-text-muted">
          {ask.from} · {ask.closedHow ?? 'Cerrado'}
          {ask.closedAt !== undefined ? ` · ${askWhen(ask.closedAt, now)}` : ''}
        </span>
      </span>
      <Button size="sm" variant="ghost" onClick={() => reopenPendingAsk(ask.id)}>
        Reabrir
      </Button>
    </li>
  );
}

/**
 * Everything pending of you, in one place: what has waited longest on top, who
 * asks and since when. It answers «¿necesitás algo de mí?» without asking. In the
 * same spot as Historial: they open on purpose, one at a time.
 */
export function PendingAsksPanel({ onClose }: { onClose?: () => void }) {
  const list = usePendingAsks();
  const now = useNow();
  const { waiting: open, seemsDone } = splitOpen(list?.open ?? []);
  const closed = list?.closed ?? [];
  return (
    <aside
      className="flex-1 min-w-0 min-h-0 soft-panel flex flex-col overflow-hidden"
      aria-label="Lo pendiente de tu lado"
    >
      <header className="flex items-center gap-6 px-12 pt-10 pb-6">
        <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
          checklist
        </span>
        <h2 className="m-0 flex-1 text-sm font-semibold text-text">
          Pendientes{open.length > 0 ? ` (${open.length})` : ''}
        </h2>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            ×
          </Button>
        )}
      </header>
      <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-8">
        {open.length === 0 ? (
          <p className="m-0 px-6 py-8 text-sm text-text-muted">Nada pendiente de tu lado.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {open.map((ask) => (
              <OpenAsk key={ask.id} ask={ask} now={now} />
            ))}
          </ul>
        )}
        {seemsDone.length > 0 && (
          <section className="mt-8 px-6" aria-label="Parece resuelto">
            <h3 className="m-0 pb-2 text-xs font-semibold text-text-muted">
              Parece resuelto ({seemsDone.length})
            </h3>
            <ul className="m-0 p-0 list-none">
              {seemsDone.map((ask) => (
                <SeemsDoneAsk key={ask.id} ask={ask} now={now} />
              ))}
            </ul>
          </section>
        )}
        {closed.length > 0 && (
          <details className="mt-8 px-6">
            <summary className="text-xs font-semibold text-text-muted cursor-pointer">
              Cerrados ({closed.length})
            </summary>
            <ul className="m-0 p-0 pt-4 list-none">
              {closed.map((ask) => (
                <ClosedAsk key={ask.id} ask={ask} now={now} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}
