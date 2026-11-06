import { useState } from 'react';

import { useDayTint } from '../effects/dayTint.js';
import { JarvisChat } from '../jarvis/JarvisChat.js';
import { useJarvisChatState } from '../jarvis/jarvisChatState.js';
import { MeetingsPanel } from '../meetings/MeetingsPanel.js';
import { useUpcomingMeetings } from '../meetings/meetingsStore.js';
import { DayStrip } from '../now/DayStrip.js';
import { NowPanel } from '../now/NowPanel.js';
import { useNowQueue } from '../now/useNowQueue.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import { type AgentView, KIND_COLOR } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import { callsForYou, controlOrder, stripTitle, toClose } from './controlRules.js';
import { permissionSummary } from './permissionSummary.js';

/** The agenda: the meetings list, or why there is none. */
function Agenda() {
  const msg = useUpcomingMeetings();
  if (msg?.connected) return <MeetingsPanel meetings={msg.meetings} title="Agenda" fill />;
  return (
    <aside aria-label="Agenda" className="w-full h-full soft-panel flex flex-col">
      <header className="flex items-center gap-5 pl-10 pr-4 py-5 border-b border-border">
        <span className="material-symbols-sharp text-sm text-accent" aria-hidden="true">
          event
        </span>
        <h2 className="m-0 flex-1 text-sm font-semibold text-text">Agenda</h2>
      </header>
      <p className="m-0 px-10 py-12 text-sm text-text-muted">
        Sin calendario: tus reuniones aparecen acá cuando la oficina puede leer tu Google Calendar
        desde Claude Code.
      </p>
    </aside>
  );
}

/** Jarvis's chat, fixed in its column: no bubble to open in this view. */
function JarvisColumn({
  jarvis,
  actions,
  onSummon,
  focusSignal,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  onSummon?: () => void;
  focusSignal: number;
}) {
  const state = useJarvisChatState(jarvis, true);
  return (
    <section aria-label="Jarvis" className="w-full h-full soft-panel flex flex-col overflow-hidden">
      <JarvisChat
        jarvis={jarvis}
        actions={actions}
        state={state}
        onSummon={onSummon}
        composerFocus={focusSignal}
      />
    </section>
  );
}

/** One agent, small: a click opens its chat or terminal beside the office. A
 *  held permission is answered right on it. */
function AgentChip({ view, actions }: { view: AgentView; actions: BoardActions }) {
  const ask = permissionSummary(view);
  const urgent = callsForYou(view);
  const spare = toClose(view);
  const status = spare ? 'Para cerrar' : view.statusText;
  return (
    <li
      className={`min-w-0 flex flex-col gap-4 rounded-lg border px-8 py-5 ${
        urgent
          ? 'border-status-permission bg-status-permission-bg'
          : spare
            ? 'border-dashed border-border bg-transparent opacity-80'
            : 'border-border bg-bg-thumb'
      } ${ask ? 'max-w-[360px]' : 'max-w-[240px]'}`}
    >
      <span className="min-w-0 flex items-center gap-6">
        <button
          type="button"
          onClick={() => actions.onSelect(view.id)}
          title={
            spare
              ? `${view.name}: terminó, entregó y está quieto sin nada pendiente para vos. Jarvis ya sabe que puede cerrarlo.`
              : `${view.name}: ${view.statusText}`
          }
          className="min-w-0 flex items-center gap-6 border-0 bg-transparent p-0 cursor-pointer text-left"
        >
          <span
            className="w-7 h-7 rounded-full shrink-0"
            style={{ background: KIND_COLOR[view.kind] }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-text truncate">{view.name}</span>
          <span
            className={`text-2xs truncate ${urgent ? 'text-status-permission-text' : 'text-text-muted'}`}
          >
            {status}
          </span>
        </button>
        {spare && actions.onClose && (
          <button
            type="button"
            onClick={() => actions.onClose?.(view.id)}
            title={`Cerrar a ${view.name} (su conversación queda guardada)`}
            aria-label={`Cerrar a ${view.name}`}
            className="shrink-0 border-0 bg-transparent p-0 text-xs leading-none text-text-muted hover:text-text cursor-pointer"
          >
            ×
          </button>
        )}
      </span>
      {ask && view.permission && actions.onAllow && actions.onDeny && (
        <>
          <span className="text-2xs text-text line-clamp-2" title={ask.detail ?? ask.title}>
            {ask.title}
            {ask.detail ? `: ${ask.detail}` : ''}
          </span>
          <ApproveButtons
            permission={view.permission}
            onAllow={actions.onAllow}
            onDeny={actions.onDeny}
          />
        </>
      )}
    </li>
  );
}

/**
 * «Control»: what you have to do and when, large — Pendientes, the agenda and
 * Jarvis's chat with its box — and every agent below as a small chip, the
 * ones that need you first. Three columns in a wide office; in a narrower
 * one, Pendientes over the agenda with Jarvis beside them. Nothing floats
 * over anything.
 */
export function ControlView({
  views,
  actions,
  jarvis,
  onSummonJarvis,
  jarvisFocus,
}: {
  views: AgentView[];
  actions: BoardActions;
  jarvis: AgentView | undefined;
  onSummonJarvis?: () => void;
  /** Changes when something (the visor's «Contestar») wants to write to Jarvis. */
  jarvisFocus: number;
}) {
  const tint = useDayTint();
  const ordered = controlOrder(views);
  const model = useNowQueue(views, jarvis?.id);
  const writable = useWritableAgents();
  // «Escribirle a Jarvis…» on a card opens its box, like the visor's «Contestar».
  const [writeSignal, setWriteSignal] = useState(0);
  const jarvisLink = jarvis
    ? {
        id: jarvis.id,
        writable: writable.has(jarvis.id),
        onWrite: () => setWriteSignal((n) => n + 1),
      }
    : undefined;
  return (
    <div
      // pt-52: the tabs and the next meeting; pb-80: the toolbar.
      className="absolute inset-0 flex flex-col gap-12 p-14 pt-52 pb-80 transition-colors duration-1000"
      style={{ background: `var(${tint})` }}
    >
      <DayStrip items={model.strip} now={model.now} />
      {/* Ahora | Jarvis; a wide office fits the agenda of the coming days between them. */}
      <div className="flex-1 min-h-0 grid gap-12 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @min-[1500px]:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="min-h-0 flex">
          <NowPanel model={model} jarvis={jarvisLink} />
        </div>
        <div className="min-h-0 hidden @min-[1500px]:flex">
          <Agenda />
        </div>
        <div className="min-h-0 flex">
          <JarvisColumn
            jarvis={jarvis}
            actions={actions}
            onSummon={onSummonJarvis}
            focusSignal={jarvisFocus + writeSignal}
          />
        </div>
      </div>
      <section aria-label="Agentes" className="shrink-0 soft-panel px-10 py-8 flex flex-col gap-6">
        <h2 className="m-0 text-2xs font-semibold uppercase tracking-wide text-text-muted">
          {stripTitle(views)}
        </h2>
        {ordered.length === 0 ? (
          <p className="m-0 text-xs text-text-muted">No hay agentes en la oficina.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-wrap items-start gap-6 max-h-[132px] overflow-y-auto">
            {ordered.map((v) => (
              <AgentChip key={v.id} view={v} actions={actions} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
