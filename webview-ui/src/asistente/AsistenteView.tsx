import { type FocusEvent, type FormEvent, useEffect, useState } from 'react';

import { useDayTint } from '../effects/dayTint.js';
import { JarvisChat } from '../jarvis/JarvisChat.js';
import { useJarvisChatState } from '../jarvis/jarvisChatState.js';
import type { AskedPermission } from '../jarvis/jarvisRules.js';
import { setJarvisHushed } from '../jarvis/jarvisVoice.js';
import type { JarvisLink } from '../now/AskActions.js';
import { type NowModel, useNowQueue } from '../now/useNowQueue.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import {
  currentMoment,
  meetingNote,
  meetingNow,
  type Moment,
  MOMENT_KEY,
  type MomentChoice,
  type MomentContext,
  momentReason,
  readChoice,
  urgentInMeeting,
} from './asistenteRules.js';
import { ClosingPanel } from './ClosingPanel.js';
import { ComingColumn } from './ComingColumn.js';
import { DecisionHand } from './DecisionHand.js';
import { MeetingBanner } from './MeetingBanner.js';
import { MomentBar } from './MomentBar.js';
import { NeedsYouStrip, TeamColumn } from './TeamColumn.js';

function readStoredChoice(): MomentChoice | undefined {
  try {
    return readChoice(localStorage.getItem(MOMENT_KEY));
  } catch {
    return undefined;
  }
}

function storeChoice(choice: MomentChoice | undefined): void {
  try {
    if (choice) localStorage.setItem(MOMENT_KEY, JSON.stringify(choice));
    else localStorage.removeItem(MOMENT_KEY);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** The moment on screen: the office's, or yours until the situation changes. */
function useMoment(ctx: MomentContext) {
  const [choice, setChoice] = useState<MomentChoice | undefined>(readStoredChoice);
  const moment = currentMoment(ctx, choice);
  const chosen = !!choice && moment === choice.moment && currentMoment(ctx, undefined) !== moment;
  const choose = (next: Moment) => {
    const picked = { moment: next, base: currentMoment({ ...ctx, typing: false }, undefined) };
    setChoice(picked);
    storeChoice(picked);
  };
  const auto = () => {
    setChoice(undefined);
    storeChoice(undefined);
  };
  return { moment, chosen, choose, auto, reason: momentReason(moment, ctx, chosen) };
}

/** Whether you are writing in Jarvis's box: focused, with something typed. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  const read = (el: EventTarget | null) =>
    setTyping(el instanceof HTMLTextAreaElement && el.value.trim().length > 0);
  return {
    typing,
    handlers: {
      onFocusCapture: (e: FocusEvent) => read(e.target),
      onInputCapture: (e: FormEvent) => read(e.target),
      onBlurCapture: () => setTyping(false),
    },
  };
}

/** The conversation with Jarvis, with what the moment puts above its box. */
function Conversation({
  jarvis,
  actions,
  onSummon,
  asked,
  model,
  moment,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  onSummon?: () => void;
  asked?: AskedPermission;
  model: NowModel;
  moment: Moment;
}) {
  const state = useJarvisChatState(jarvis, true);
  const writable = useWritableAgents();
  // «Responder» on a card opens Jarvis's box with that ask quoted (replyTo).
  const [writeSignal, setWriteSignal] = useState(0);
  const link: JarvisLink | undefined = jarvis
    ? {
        id: jarvis.id,
        writable: writable.has(jarvis.id),
        onWrite: () => setWriteSignal((n) => n + 1),
      }
    : undefined;
  const { queue, now, meetings } = model;
  const waiting = [...(queue.first ? [queue.first] : []), ...queue.next];
  const meeting = moment === 'reunion' ? meetingNow(meetings, now) : undefined;
  const urgent = meeting ? waiting.filter((r) => urgentInMeeting(r, meeting)) : waiting;
  const hand = moment === 'decidir' || moment === 'reunion';
  return (
    <section aria-label="Jarvis" className="w-full h-full soft-panel flex flex-col overflow-hidden">
      {moment === 'reunion' && (
        <MeetingBanner meeting={meeting} kept={waiting.length - urgent.length} now={now} />
      )}
      <JarvisChat
        jarvis={jarvis}
        actions={actions}
        state={state}
        onSummon={onSummon}
        composerFocus={writeSignal}
        asked={asked}
        permissionsOnly
        shapeText={meeting ? (text) => meetingNote(meeting, text) : undefined}
        aboveBox={
          hand ? (
            <DecisionHand waiting={urgent} now={now} meetings={meetings} jarvis={link} />
          ) : undefined
        }
      />
    </section>
  );
}

/**
 * «Asistente» (design C «Momentos», 2026-11-11; it replaces Control): the
 * conversation with Jarvis in the middle, and around it what the moment
 * calls for (asistenteRules.ts). The office picks the moment from your
 * calendar, the clock, what waits on you and whether you are writing; a
 * click picks one by hand until that situation changes. Nothing floats over
 * what you write.
 */
export function AsistenteView({
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
  /** Another agent's permission Jarvis asks you about. */
  asked?: AskedPermission;
}) {
  const tint = useDayTint();
  const model = useNowQueue(views, jarvis?.id);
  const { typing, handlers } = useTyping();
  const waiting = (model.queue.first ? 1 : 0) + model.queue.next.length;
  const ctx = { now: model.now, meetings: model.meetings, waiting, typing };
  const { moment, chosen, choose, auto, reason } = useMoment(ctx);

  // In a meeting Jarvis keeps quiet; your «Silenciar» stays as you left it.
  useEffect(() => {
    setJarvisHushed(moment === 'reunion');
    return () => setJarvisHushed(false);
  }, [moment]);

  const deciding = moment === 'decidir';
  const closing = moment === 'cierre';
  return (
    <div
      // pt-52: the tabs and the next meeting; pb-80: the toolbar.
      className="absolute inset-0 flex flex-col gap-10 p-14 pt-52 pb-80 transition-colors duration-1000"
      style={{ background: `var(${tint})` }}
    >
      <MomentBar
        moment={moment}
        onChoose={choose}
        onAuto={auto}
        chosen={chosen}
        reason={reason}
        waiting={waiting}
      />
      {moment === 'reunion' && (
        // In a meeting what holds an agent back still shows.
        <NeedsYouStrip views={views} actions={actions} />
      )}
      {deciding && (
        // Narrow: the team above, short, so a held permission is still answered here.
        <div className="shrink-0 max-h-[150px] flex @min-[1100px]:hidden">
          <TeamColumn views={views} actions={actions} />
        </div>
      )}
      <div
        className={`flex-1 min-h-0 grid gap-12 ${
          deciding
            ? 'grid-cols-1 @min-[1100px]:grid-cols-[220px_minmax(0,1fr)] @min-[1300px]:grid-cols-[220px_minmax(0,1fr)_280px] @min-[1600px]:grid-cols-[240px_minmax(0,1fr)_320px]'
            : closing
              ? 'grid-cols-1 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
              : 'grid-cols-1'
        }`}
      >
        {deciding && (
          <div className="min-h-0 hidden @min-[1100px]:flex">
            <TeamColumn views={views} actions={actions} />
          </div>
        )}
        {closing && (
          <div className="min-h-0 flex">
            <ClosingPanel views={views} actions={actions} model={model} />
          </div>
        )}
        <div
          className={`min-h-0 flex ${deciding || closing ? '' : 'w-full max-w-[920px] mx-auto'}`}
          {...handlers}
        >
          <Conversation
            jarvis={jarvis}
            actions={actions}
            onSummon={onSummonJarvis}
            asked={asked}
            model={model}
            moment={moment}
          />
        </div>
        {deciding && (
          <div className="min-h-0 hidden @min-[1300px]:flex">
            <ComingColumn model={model} />
          </div>
        )}
      </div>
    </div>
  );
}
