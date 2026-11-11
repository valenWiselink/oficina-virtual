import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { closePendingAsk, keepPendingAsk, reopenPendingAsk } from './pendingAsksStore.js';
import { askWhen } from './pendingAsksView.js';

const COPIED_MS = 1500;

/** Copies the command an ask brings, and says so for a moment. */
export function CopyCommand({ command }: { command: string }) {
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

/** One that looks done (its PR merged, the agent waiting for it closed): one
 *  click closes it, the other keeps it. */
export function SeemsDoneAsk({ ask, now }: { ask: PendingAskEntry; now: number }) {
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

export function ClosedAsk({ ask, now }: { ask: PendingAskEntry; now: number }) {
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
