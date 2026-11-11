import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { ClosedAsk, CopyCommand, SeemsDoneAsk } from '../pendingAsks/PendingAsksPanel.js';
import {
  closePendingAsk,
  mergePendingAsk,
  snoozePendingAskUntil,
  useMergeState,
} from '../pendingAsks/pendingAsksStore.js';
import { askWhen } from '../pendingAsks/pendingAsksView.js';
import { sendToAgent } from '../terminal/agentInput.js';
import { answerChoices, answerLine, type Ranked } from './nowRules.js';
import { type MeetingTime, whenText } from './nowTime.js';
import { pickedTime, snoozeChoices } from './snoozeRules.js';
import type { NowModel } from './useNowQueue.js';

const PROD = /\b(?:main|master|producci[oó]n|prod)\b/i;

type Entry = Ranked<PendingAskEntry>;

interface JarvisLink {
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

/** Sí / No / Hecho that also tell Jarvis, written as if you typed it. */
function useTellJarvis(jarvis: JarvisLink | undefined) {
  const [failed, setFailed] = useState(false);
  const tell = (text: string, then?: () => void) => {
    if (!jarvis?.writable) return;
    void sendToAgent(jarvis.id, text).then((ok) => {
      setFailed(!ok);
      if (ok) then?.();
    });
  };
  return { tell, failed, can: jarvis?.writable === true };
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

/** The one thing to do now: what, why, what if not, and the button that does it. */
function NowCard({
  entry,
  first,
  now,
  jarvis,
  meetings,
}: {
  entry: Entry;
  first: boolean;
  now: number;
  jarvis?: JarvisLink;
  meetings: readonly MeetingTime[];
}) {
  const { ask, reasons } = entry;
  const { tell, failed, can } = useTellJarvis(jarvis);
  // An answer goes to Jarvis with the ask's id: the office marks it answered.
  const choices = can ? answerChoices(ask) : [];
  const why = ask.why ?? reasons.join(' · ');
  return (
    <article
      className="flex flex-col gap-10 rounded-lg border-2 border-accent bg-bg px-14 py-12"
      aria-label="Lo primero"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <span className="text-2xs font-bold uppercase tracking-wide text-accent">
          {first ? 'Primero' : 'Elegido'}
          {reasons[0] ? ` · ${reasons[0]}` : ''}
        </span>
        <span className="text-2xs text-text-muted">
          {ask.from} · {askWhen(ask.at, now)}
        </span>
      </div>
      <p className="m-0 text-xl font-bold leading-snug text-text break-words">{ask.text}</p>
      {(why || ask.ifNot) && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-3 text-xs">
          {why && (
            <>
              <dt className="text-text-muted">Por qué ahora</dt>
              <dd className="m-0 text-text">{why}</dd>
            </>
          )}
          {ask.ifNot && (
            <>
              <dt className="text-text-muted">Si no</dt>
              <dd className="m-0 text-text">{ask.ifNot}</dd>
            </>
          )}
        </dl>
      )}
      {ask.command && !ask.mergeUrl && (
        <code className="font-mono text-2xs text-text-2 bg-bg-thumb border border-border rounded-md px-8 py-6 overflow-x-auto whitespace-nowrap">
          {ask.command}
        </code>
      )}
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
        {ask.from === 'Jarvis' && jarvis?.onWrite && (
          <Button size="sm" variant="ghost" onClick={jarvis.onWrite}>
            Escribirle a Jarvis…
          </Button>
        )}
      </div>
      {failed && (
        <span className="text-2xs text-status-error">
          No le llegó a Jarvis: su terminal no responde. Escribile desde su chat.
        </span>
      )}
    </article>
  );
}

function QueueRow({
  entry,
  now,
  onPick,
  later,
}: {
  entry: Entry;
  now: number;
  onPick: () => void;
  later?: boolean;
}) {
  const { ask, reasons, times } = entry;
  const when =
    later && times.notBefore !== undefined ? whenText(times.notBefore, now) : askWhen(ask.at, now);
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onPick}
        className="w-full grid grid-cols-[minmax(0,1fr)_auto] gap-8 border-0 bg-transparent px-2 py-6 text-left cursor-pointer hover:bg-bg-thumb rounded-md"
        title="Verlo primero"
      >
        <span className="min-w-0 flex flex-col gap-1">
          <span className="text-xs text-text line-clamp-2 break-words">{ask.text}</span>
          <span className="text-2xs text-text-muted truncate">
            {ask.from}
            {reasons[0] && !later ? ` · ${reasons[0]}` : ''}
          </span>
        </span>
        <span className="text-2xs font-mono text-text-muted whitespace-nowrap">{when}</span>
      </button>
    </li>
  );
}

/**
 * «Ahora» (chosen 2026-11-06): of everything that waits on you, one in large
 * with why it goes first and the button that settles it (Mergear, Sí / No,
 * Copiar comando, Hecho); the rest in line below, what is for later apart.
 * A tap on any row brings it up.
 */
export function NowPanel({ model, jarvis }: { model: NowModel; jarvis?: JarvisLink }) {
  const [picked, setPicked] = useState<string>();
  const { queue, now, seemsDone, closed } = model;
  const all = [...(queue.first ? [queue.first] : []), ...queue.next, ...queue.later];
  const shown = all.find((r) => r.ask.id === picked) ?? queue.first;
  const next = [...(queue.first ? [queue.first] : []), ...queue.next].filter((r) => r !== shown);
  const later = queue.later.filter((r) => r !== shown);
  const waiting = (queue.first ? 1 : 0) + queue.next.length;
  return (
    <aside
      className="flex-1 min-w-0 min-h-0 soft-panel flex flex-col overflow-hidden"
      aria-label="Ahora"
    >
      <header className="flex items-center gap-6 px-12 pt-10 pb-6">
        <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
          bolt
        </span>
        <h2 className="m-0 flex-1 text-sm font-semibold text-text">
          Ahora
          {waiting > 1 && (
            <span className="font-normal text-text-muted"> · {waiting - 1} más esperan</span>
          )}
        </h2>
      </header>
      <div className="overflow-y-auto flex-1 min-h-0 px-10 pb-10 flex flex-col gap-12">
        {shown ? (
          <NowCard
            key={shown.ask.id}
            entry={shown}
            first={shown === queue.first}
            now={now}
            jarvis={jarvis}
            meetings={model.meetings}
          />
        ) : (
          <p className="m-0 px-4 py-8 text-sm text-text-muted">
            {model.missing
              ? 'Esta oficina no lleva tus pendientes.'
              : 'Nada te espera ahora. Cuando algo te necesite, aparece acá primero.'}
          </p>
        )}
        {next.length > 0 && (
          <section aria-label="Después" className="flex flex-col gap-2">
            <h3 className="m-0 px-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
              Después ({next.length})
            </h3>
            <ul className="m-0 p-0 list-none">
              {next.map((r) => (
                <QueueRow key={r.ask.id} entry={r} now={now} onPick={() => setPicked(r.ask.id)} />
              ))}
            </ul>
          </section>
        )}
        {later.length > 0 && (
          <section aria-label="Más tarde" className="flex flex-col gap-2">
            <h3 className="m-0 px-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
              Más tarde ({later.length})
            </h3>
            <ul className="m-0 p-0 list-none">
              {later.map((r) => (
                <QueueRow
                  key={r.ask.id}
                  entry={r}
                  now={now}
                  later
                  onPick={() => setPicked(r.ask.id)}
                />
              ))}
            </ul>
          </section>
        )}
        {seemsDone.length > 0 && (
          <section aria-label="Parece resuelto" className="flex flex-col gap-2">
            <h3 className="m-0 px-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
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
          <details className="px-2">
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
