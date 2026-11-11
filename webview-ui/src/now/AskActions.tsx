import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { replyTo } from '../jarvis/replyTo.js';
import { CopyCommand } from '../pendingAsks/PendingAsksPanel.js';
import {
  closePendingAsk,
  mergePendingAsk,
  snoozePendingAskUntil,
  useMergeState,
} from '../pendingAsks/pendingAsksStore.js';
import { useTellJarvis } from './askHooks.js';
import { answerChoices, answerLine } from './nowRules.js';
import type { MeetingTime } from './nowTime.js';
import { pickedTime, snoozeChoices } from './snoozeRules.js';

const PROD = /\b(?:main|master|producci[oó]n|prod)\b/i;

export interface JarvisLink {
  id: number;
  /** Its terminal is here: a tap can answer it as if you typed. */
  writable: boolean;
  /** Open its chat box to write more. */
  onWrite?: () => void;
}

/** «Mergear #2752»: a confirmation that shows what runs, then gh's answer. */
function MergeButton({ ask }: { ask: PendingAskEntry }) {
  const [confirming, setConfirming] = useState(false);
  const state = useMergeState(ask.id);
  if (!ask.mergeUrl) return null;
  const number = ask.mergeUrl.split('/').pop();
  if (state?.busy) {
    return (
      <Button size="sm" variant="disabled" disabled>
        Mergeando #{number}…
      </Button>
    );
  }
  if (confirming) {
    return (
      <div className="w-full flex flex-col gap-6 rounded-md border border-accent px-8 py-7">
        <span className="text-xs text-text">
          {PROD.test(`${ask.text} ${ask.mergeUrl}`)
            ? `Mergea el PR #${number} y va a producción. Corre:`
            : `Mergea el PR #${number}. Corre:`}
        </span>
        <code className="font-mono text-2xs text-text-2 break-all">{ask.mergeCommand}</code>
        <span className="flex flex-wrap gap-6">
          <Button
            size="sm"
            variant="accent"
            onClick={() => {
              setConfirming(false);
              mergePendingAsk(ask.id);
            }}
          >
            Confirmar merge
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </span>
      </div>
    );
  }
  return (
    <>
      <Button size="sm" variant="accent" onClick={() => setConfirming(true)}>
        Mergear #{number}
      </Button>
      {state && !state.ok && (
        <span className="w-full text-2xs text-status-error">{state.message}</span>
      )}
    </>
  );
}

/**
 * «Posponer»: times that make sense for this ask (after the meeting it names,
 * tomorrow morning, Monday…) or a day and time picked by hand.
 */
function SnoozeMenu({
  ask,
  now,
  meetings,
}: {
  ask: PendingAskEntry;
  now: number;
  meetings: readonly MeetingTime[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState('');
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-expanded={false}>
        Posponer…
      </Button>
    );
  }
  const until = (at: number) => {
    snoozePendingAskUntil(ask.id, at);
    setOpen(false);
  };
  const pickedAt = pickedTime(picked, now);
  return (
    <div
      role="group"
      aria-label="Posponer hasta"
      className="w-full flex flex-col gap-4 rounded-md border border-border bg-bg-thumb px-8 py-7"
    >
      <span className="text-2xs text-text-muted">Te lo traigo de nuevo…</span>
      <span className="flex flex-wrap gap-6">
        {snoozeChoices(ask, now, meetings).map((c) => (
          <Button key={c.label} size="sm" onClick={() => until(c.until)} title={c.when}>
            {c.label} <span className="text-text-muted font-mono text-2xs">{c.when}</span>
          </Button>
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-6">
        <label className="text-2xs text-text-muted" htmlFor={`posponer-${ask.id}`}>
          Otro día y hora
        </label>
        <input
          id={`posponer-${ask.id}`}
          type="datetime-local"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="text-xs bg-bg border border-border rounded-md px-6 py-3 text-text"
        />
        <Button
          size="sm"
          variant={pickedAt ? 'accent' : 'disabled'}
          disabled={!pickedAt}
          onClick={() => pickedAt && until(pickedAt)}
        >
          Posponer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

/**
 * What settles an ask, in one row: «Mergear», its answers (Sí / No or the
 * options Jarvis gave, sent with its id), «Copiar comando», «Hecho» (Jarvis
 * hears it), «Posponer…» and «Responder…» (Jarvis's box with it quoted).
 */
export function AskButtons({
  ask,
  now,
  meetings,
  jarvis,
}: {
  ask: PendingAskEntry;
  now: number;
  meetings: readonly MeetingTime[];
  jarvis?: JarvisLink;
}) {
  const { tell, failed, can } = useTellJarvis(jarvis);
  // An answer goes to Jarvis with the ask's id: the office marks it answered.
  const choices = can ? answerChoices(ask) : [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-6">
        <MergeButton ask={ask} />
        {choices.map((choice, i) => (
          <Button
            key={choice}
            size="sm"
            variant={i === 0 && !ask.mergeUrl ? 'accent' : 'default'}
            onClick={() => tell(answerLine(ask, choice))}
          >
            {choice}
          </Button>
        ))}
        {ask.command && <CopyCommand command={ask.command} />}
        {choices.length === 0 && (
          // Jarvis hears it from the office: whoever waited on it can go on.
          <Button
            size="sm"
            variant={ask.mergeUrl ? 'default' : 'accent'}
            onClick={() => closePendingAsk(ask.id)}
          >
            Hecho
          </Button>
        )}
        <SnoozeMenu ask={ask} now={now} meetings={meetings} />
        {jarvis?.onWrite && (
          // Jarvis's box opens with this ask quoted: your words go with its id.
          <Button
            size="sm"
            variant="ghost"
            title="Escribirle a Jarvis sobre este pendiente"
            onClick={() => {
              replyTo(ask);
              jarvis.onWrite?.();
            }}
          >
            Responder…
          </Button>
        )}
      </div>
      {failed && (
        <span className="text-2xs text-status-error">
          No le llegó a Jarvis: su terminal no responde. Escribile desde su chat.
        </span>
      )}
    </>
  );
}
