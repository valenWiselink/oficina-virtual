import { useState } from 'react';

import { useDayTint } from '../effects/dayTint.js';
import { JarvisChat } from '../jarvis/JarvisChat.js';
import { useJarvisChatState } from '../jarvis/jarvisChatState.js';
import type { AskedPermission } from '../jarvis/jarvisRules.js';
import type { JarvisLink } from '../now/AskActions.js';
import { type NowModel, useNowQueue } from '../now/useNowQueue.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { type Moment, MOMENT_KEY, momentLabel, readMoment } from './asistenteRules.js';
import { ComingColumn } from './ComingColumn.js';
import { DecisionHand } from './DecisionHand.js';
import { TeamColumn } from './TeamColumn.js';

function useMoment(): [Moment, (next: Moment) => void] {
  const [moment, setMoment] = useState<Moment>(() => {
    try {
      return readMoment(localStorage.getItem(MOMENT_KEY));
    } catch {
      return 'decidir';
    }
  });
  const choose = (next: Moment) => {
    setMoment(next);
    try {
      localStorage.setItem(MOMENT_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  };
  return [moment, choose];
}

/** Escribir · Decidir: the shape of the screen, chosen by hand (for now). */
function MomentBar({
  moment,
  onChange,
  waiting,
}: {
  moment: Moment;
  onChange: (m: Moment) => void;
  waiting: number;
}) {
  const options: Array<[Moment, string, string]> = [
    ['escribir', 'edit', 'Sólo la conversación: lo que espera, en una línea'],
    ['decidir', 'bolt', 'Lo que espera, en cartas arriba del cuadro, con el equipo y lo que viene'],
  ];
  return (
    <div className="shrink-0 flex items-center gap-10">
      <div className="flex rounded-lg bg-bg-thumb p-2" role="group" aria-label="Momento">
        {options.map(([id, icon, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={moment === id}
            title={title}
            onClick={() => onChange(id)}
            className={`flex items-center gap-4 border-0 rounded-md px-10 py-4 text-xs font-medium cursor-pointer ${
              moment === id
                ? 'bg-accent text-white'
                : 'bg-transparent text-text-muted hover:text-text'
            }`}
          >
            <span className="material-symbols-sharp text-sm" aria-hidden="true">
              {icon}
            </span>
            {momentLabel(id, id === 'decidir' ? waiting : 0)}
          </button>
        ))}
      </div>
      {moment === 'escribir' && waiting > 0 && (
        <button
          type="button"
          onClick={() => onChange('decidir')}
          className="border-0 bg-transparent p-0 text-xs text-text-muted hover:text-text cursor-pointer"
        >
          {waiting === 1 ? '1 decisión espera' : `${waiting} decisiones esperan`} · ver
        </button>
      )}
    </div>
  );
}

/** The conversation with Jarvis, with what waits on you as cards above its box. */
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
  const { queue } = model;
  const waiting = [...(queue.first ? [queue.first] : []), ...queue.next];
  return (
    <section aria-label="Jarvis" className="w-full h-full soft-panel flex flex-col overflow-hidden">
      <JarvisChat
        jarvis={jarvis}
        actions={actions}
        state={state}
        onSummon={onSummon}
        composerFocus={writeSignal}
        asked={asked}
        permissionsOnly
        aboveBox={
          moment === 'decidir' ? (
            <DecisionHand
              waiting={waiting}
              now={model.now}
              meetings={model.meetings}
              jarvis={link}
            />
          ) : undefined
        }
      />
    </section>
  );
}

/**
 * «Asistente» (design C «Momentos», 2026-11-11; it replaces Control): the
 * conversation with Jarvis in the middle and, in «Decidir», what waits on you
 * as cards right above its box, the team on the left and what comes on the
 * right. «Escribir» folds it all into the conversation. Nothing floats over
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
  const [moment, setMoment] = useMoment();
  const model = useNowQueue(views, jarvis?.id);
  const waiting = (model.queue.first ? 1 : 0) + model.queue.next.length;
  const deciding = moment === 'decidir';
  return (
    <div
      // pt-52: the tabs and the next meeting; pb-80: the toolbar.
      className="absolute inset-0 flex flex-col gap-10 p-14 pt-52 pb-80 transition-colors duration-1000"
      style={{ background: `var(${tint})` }}
    >
      <MomentBar moment={moment} onChange={setMoment} waiting={waiting} />
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
            : 'grid-cols-1'
        }`}
      >
        {deciding && (
          <div className="min-h-0 hidden @min-[1100px]:flex">
            <TeamColumn views={views} actions={actions} />
          </div>
        )}
        <div className={`min-h-0 flex ${deciding ? '' : 'w-full max-w-[920px] mx-auto'}`}>
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
