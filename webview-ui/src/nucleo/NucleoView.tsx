import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Meeting, PendingAskEntry } from '../../../core/src/messages.js';
import { useArtifacts } from '../artifacts/artifactsStore.js';
import { artifactAuthor, artifactWhen } from '../artifacts/artifactsView.js';
import { activityOf } from '../asistente/asistenteRules.js';
import { TeamRow } from '../asistente/TeamColumn.js';
import { useDayLog } from '../history/dayLogStore.js';
import { JarvisChat } from '../jarvis/JarvisChat.js';
import { useJarvisChatState } from '../jarvis/jarvisChatState.js';
import type { AskedPermission } from '../jarvis/jarvisRules.js';
import { useUpcomingMeetings } from '../meetings/meetingsStore.js';
import { AskButtons, type JarvisLink } from '../now/AskActions.js';
import { type NowModel, useNowQueue } from '../now/useNowQueue.js';
import { DelegatedAsk } from '../pendingAsks/PendingAsksPanel.js';
import { askWhen } from '../pendingAsks/pendingAsksView.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import { type AgentView, KIND_COLOR } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { callsForYou } from '../views/controlRules.js';
import { JarvisPresence, type PresenceHandle } from './JarvisPresence.js';
import { needKeyOf, nextMeeting, untilText, workingCount } from './nucleoRules.js';

const ARTIFACTS_SHOWN = 4;
/** After the last key or answer, the sphere stays small this long. */
const CONVERSING_MS = 30_000;

function Label({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <h2 className="m-0 flex items-baseline gap-8 text-2xs font-mono font-medium uppercase tracking-wider text-text-muted">
      {children}
      {aside && <span className="normal-case tracking-normal font-ui">{aside}</span>}
    </h2>
  );
}

const hourOf = (ms: number) =>
  new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** The next meeting: its hour big, in mono, and «Unirse». */
function NextMeeting({ meeting, now }: { meeting: Meeting; now: number }) {
  const soon = meeting.start - now <= 15 * 60_000;
  return (
    <section
      aria-label="Próxima reunión"
      className={`flex items-center gap-10 pl-10 border-l-2 ${soon ? 'border-status-active' : 'border-border'}`}
    >
      <span className="font-mono text-4xl leading-none text-status-active tabular-nums">
        {hourOf(meeting.start)}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-2">
        <span className="text-sm font-semibold text-text truncate">{meeting.title}</span>
        <span className="text-2xs text-text-muted">{untilText(meeting, now)}</span>
      </span>
      {meeting.joinUrl && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md px-10 py-5 text-xs font-semibold no-underline bg-status-active text-bg hover:opacity-90"
        >
          Unirse
        </a>
      )}
    </section>
  );
}

/** One «Te toca»: who and when, what, and the buttons that settle it. */
function TocaRow({
  ask,
  model,
  jarvis,
}: {
  ask: PendingAskEntry;
  model: NowModel;
  jarvis?: JarvisLink;
}) {
  return (
    <li className="flex flex-col gap-4 py-8 border-b border-border last:border-b-0">
      <span className="text-2xs text-text-muted">
        <span className="font-mono text-accent">{ask.id}</span> · {ask.from} ·{' '}
        {askWhen(ask.at, model.now)}
      </span>
      <span className="text-sm text-text leading-snug break-words">{ask.text}</span>
      <AskButtons ask={ask} now={model.now} meetings={model.meetings} jarvis={jarvis} />
    </li>
  );
}

/** «Te necesita»: who holds a permission, the next meeting, «Te toca N». */
function NeedsColumn({
  views,
  actions,
  model,
  meetings,
  jarvis,
}: {
  views: AgentView[];
  actions: BoardActions;
  model: NowModel;
  meetings: readonly Meeting[];
  jarvis?: JarvisLink;
}) {
  const log = useDayLog();
  const needing = views.filter(callsForYou);
  const meeting = nextMeeting(meetings, model.now);
  const toca = [...(model.queue.first ? [model.queue.first] : []), ...model.queue.next].map(
    (r) => r.ask,
  );
  return (
    <section aria-label="Te necesita" className="min-h-0 flex flex-col gap-14 overflow-y-auto pr-4">
      <Label>Te necesita</Label>
      {needing.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-6">
          {needing.map((v) => (
            <TeamRow
              key={v.id}
              view={v}
              actions={actions}
              activity={activityOf(log, v.name, model.now)}
            />
          ))}
        </ul>
      )}
      {meeting && <NextMeeting meeting={meeting} now={model.now} />}
      <section aria-label="Te toca" className="flex flex-col gap-2">
        <h3 className="m-0 flex items-baseline gap-8">
          <span className="font-mono text-4xl leading-none text-accent tabular-nums">
            {toca.length}
          </span>
          <span className="text-2xs font-mono uppercase tracking-wider text-text-muted">
            Te toca
          </span>
        </h3>
        {toca.length === 0 ? (
          <p className="m-0 text-xs text-text-muted">Nada por ahora.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {toca.map((ask) => (
              <TocaRow key={ask.id} ask={ask} model={model} jarvis={jarvis} />
            ))}
          </ul>
        )}
      </section>
      {model.delegated.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-2xs font-mono uppercase tracking-wider text-text-muted">
            Lo hacen agentes {model.delegated.length}
          </summary>
          <ul className="m-0 p-0 pt-4 list-none">
            {model.delegated.map((ask) => (
              <DelegatedAsk key={ask.id} ask={ask} now={model.now} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** «En marcha»: the agents and what each does, the rest of today, the artifacts. */
function UnderwayColumn({
  views,
  actions,
  model,
  meetings,
}: {
  views: AgentView[];
  actions: BoardActions;
  model: NowModel;
  meetings: readonly Meeting[];
}) {
  const artifacts = useArtifacts()?.artifacts ?? [];
  const working = workingCount(views);
  const meeting = nextMeeting(meetings, model.now);
  const later = meetings.filter((m) => m.end > model.now && m.id !== meeting?.id);
  return (
    <section aria-label="En marcha" className="min-h-0 flex flex-col gap-14 overflow-y-auto pl-4">
      <Label>En marcha</Label>
      <section aria-label="Agentes" className="flex flex-col gap-6">
        <h3 className="m-0 flex items-baseline gap-8">
          <span className="font-mono text-4xl leading-none text-text tabular-nums">{working}</span>
          <span className="text-2xs font-mono uppercase tracking-wider text-text-muted">
            trabajando
          </span>
        </h3>
        {views.length === 0 ? (
          <p className="m-0 text-xs text-text-muted">No hay agentes en la oficina.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col">
            {views.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => actions.onSelect(v.id)}
                  title={`${v.name}: ${v.statusText}`}
                  className="w-full flex items-baseline gap-8 py-4 border-0 bg-transparent text-left cursor-pointer rounded-sm hover:bg-bg-thumb focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span
                    className="w-7 h-7 rounded-full shrink-0 translate-y-[-1px]"
                    style={{ background: KIND_COLOR[v.kind] }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold text-text shrink-0">{v.name}</span>
                  <span className="flex-1 min-w-0 text-2xs text-text-muted truncate">
                    {v.statusText}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {later.length > 0 && (
        <section aria-label="Agenda" className="flex flex-col gap-4">
          <Label>Agenda</Label>
          <ul className="m-0 p-0 list-none flex flex-col gap-4">
            {later.map((m) => (
              <li key={m.id} className="flex items-baseline gap-8">
                <span className="font-mono text-sm text-text tabular-nums">{hourOf(m.start)}</span>
                <span className="flex-1 min-w-0 text-xs text-text truncate">{m.title}</span>
                {m.joinUrl && (
                  <a
                    href={m.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xs text-text-2 hover:text-text"
                  >
                    Unirse
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Artifacts" className="flex flex-col gap-4">
        <Label aside={artifacts.length > 0 ? `${artifacts.length} recientes` : undefined}>
          Artifacts
        </Label>
        {artifacts.length === 0 ? (
          <p className="m-0 text-xs text-text-muted">Todavía nadie publicó nada.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {artifacts.slice(0, ARTIFACTS_SHOWN).map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline gap-8 py-2 no-underline text-text hover:text-accent"
                >
                  <span className="flex-1 min-w-0 text-xs truncate">{a.title}</span>
                  <span className="shrink-0 text-2xs text-text-muted">
                    {artifactAuthor(a)} · {artifactWhen(a.at, model.now)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/**
 * «Núcleo» (design chosen 2026-11-19): Jarvis at the center as a glass sphere
 * with his conversation below, «Te necesita» on the left (permissions, the
 * next meeting, «Te toca» with its buttons, what agents do for you) and
 * «En marcha» on the right (the agents, the day, the artifacts). Nothing
 * moves unless something happens.
 */
export function NucleoView({
  views,
  actions,
  jarvis,
  onSummonJarvis,
  asked,
}: {
  views: AgentView[];
  actions: BoardActions;
  jarvis: AgentView | undefined;
  onSummonJarvis?: () => void;
  asked?: AskedPermission;
}) {
  const model = useNowQueue(views, jarvis?.id);
  const meetingsMsg = useUpcomingMeetings();
  const meetings = meetingsMsg?.connected ? meetingsMsg.meetings : [];
  const state = useJarvisChatState(jarvis, true);
  const writable = useWritableAgents();
  const [writeSignal, setWriteSignal] = useState(0);
  const presence = useRef<PresenceHandle>(null);
  const [conversing, setConversing] = useState(false);
  const quiet = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const others = views.filter((v) => v.id !== jarvis?.id);

  const link: JarvisLink | undefined = jarvis
    ? {
        id: jarvis.id,
        writable: writable.has(jarvis.id),
        onWrite: () => setWriteSignal((n) => n + 1),
      }
    : undefined;

  const converse = () => {
    setConversing(true);
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = setTimeout(() => setConversing(false), CONVERSING_MS);
  };
  // A new answer keeps the conversation large for a while too.
  const answer = jarvis?.lastReplyHead;
  useEffect(() => {
    if (answer) converse();
  }, [answer]);
  useEffect(() => () => clearTimeout(quiet.current), []);

  return (
    <div
      // pt-52: the tabs and the next meeting; pb-80: the toolbar.
      className="absolute inset-0 grid gap-24 p-14 pt-52 pb-80 grid-cols-1 @min-[1100px]:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(220px,270px)]"
    >
      <div className="min-h-0 hidden @min-[1100px]:flex">
        <NeedsColumn
          views={others}
          actions={actions}
          model={model}
          meetings={meetings}
          jarvis={link}
        />
      </div>
      <section
        aria-label="Jarvis"
        className="min-h-0 min-w-0 flex flex-col items-stretch gap-8 bg-bg rounded-xl px-10 pt-10 pb-10 overflow-hidden"
        // Reading as the events bubble: a key in his box makes him lean in.
        onInput={() => {
          presence.current?.key();
          converse();
        }}
      >
        <JarvisPresence
          ref={presence}
          jarvis={jarvis}
          needKey={needKeyOf(views, model)}
          compact={conversing}
        />
        {/* JarvisChat is a fragment (header, thread, box): it needs a column. */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden rounded-lg border border-border">
          <JarvisChat
            jarvis={jarvis}
            actions={actions}
            state={state}
            onSummon={onSummonJarvis}
            composerFocus={writeSignal}
            asked={asked}
            permissionsOnly
            bare
          />
        </div>
      </section>
      <div className="min-h-0 hidden @min-[1100px]:flex">
        <UnderwayColumn views={others} actions={actions} model={model} meetings={meetings} />
      </div>
    </div>
  );
}
