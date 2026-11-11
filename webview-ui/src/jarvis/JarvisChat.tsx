import { type ReactNode, useEffect, useState } from 'react';

import { ChatPane } from '../chat/ChatPane.js';
import { Button } from '../components/ui/Button.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { clock } from './dictation.js';
import type { useFleetingNote } from './heardNote.js';
import { JarvisAsk } from './JarvisAsk.js';
import type { JarvisChatState } from './jarvisChatState.js';
import type { EarsState } from './jarvisEars.js';
import { dismissJarvisNotice } from './jarvisNotice.js';
import { JarvisRing } from './JarvisRing.js';
import { type AskedPermission, jarvisLine } from './jarvisRules.js';
import { setJarvisMuted } from './jarvisVoice.js';
import { clearReply, type ReplyTarget, replyText, useReplyTarget } from './replyTo.js';
import { talkToJarvis } from './talk.js';

/** How long it has been listening, «0:42». */
function ListenClock({ since }: { since: number | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{clock(Math.max(0, now - (since ?? now)))}</span>;
}

/** The notice about its voice and what its ears are doing. */
export function JarvisStatusLines({ state }: { state: JarvisChatState }) {
  const { notice, earsLine, ears } = state;
  return (
    <>
      {notice && (
        <div className="flex items-start gap-8" role="status">
          <p className="m-0 flex-1 min-w-0 text-2xs text-warning">{notice}</p>
          <Button size="sm" variant="ghost" onClick={dismissJarvisNotice}>
            Entendido
          </Button>
        </div>
      )}
      {earsLine && (
        <p
          className={`m-0 text-2xs ${ears.error && ears.phase === 'idle' ? 'text-danger' : 'text-text-2'}`}
          role="status"
        >
          {earsLine}
        </p>
      )}
    </>
  );
}

/** What it heard, for a moment: hovering holds it, a tap closes it. */
export function HeardNote({
  text,
  note,
  boxed,
}: {
  text: string;
  note: ReturnType<typeof useFleetingNote>;
  /** Beside the bubble (a box of its own) or a line in the chat's status row. */
  boxed: boolean;
}) {
  return (
    <div className="anim-float-up" role="status">
      <button
        type="button"
        title="Tocá para cerrarlo"
        onClick={note.dismiss}
        onMouseEnter={() => note.hold(true)}
        onMouseLeave={() => note.hold(false)}
        className={`w-full text-left border-0 cursor-pointer transition-opacity duration-500 motion-reduce:transition-none ${
          note.phase === 'fading' ? 'opacity-0' : 'opacity-100'
        } ${boxed ? 'soft-panel px-12 py-8' : 'bg-transparent p-0'}`}
      >
        <span className="block text-2xs text-text-2 line-clamp-3">{text}</span>
      </button>
    </div>
  );
}

/** Talk to it: press to start, again to finish and send (also Alt+J). */
function MicButton({ jarvisId, ears }: { jarvisId: number; ears: EarsState }) {
  if (ears.phase === 'listening') {
    return (
      <Button
        size="md"
        aria-pressed
        aria-label="Escuchando: terminar y mandárselo a Jarvis (Alt+J)"
        title="Terminar y mandar (Alt+J)"
        className="h-40 shrink-0 flex items-center gap-6 bg-danger! border-danger! text-white! hover:opacity-90"
        onClick={() => talkToJarvis(jarvisId)}
      >
        <span className="w-8 h-8 rounded-full bg-white soft-pulse" aria-hidden="true" />
        <ListenClock since={ears.since} />
        <span className="material-symbols-sharp text-lg" aria-hidden="true">
          stop
        </span>
      </Button>
    );
  }
  return (
    <Button
      size="icon_lg"
      className="shrink-0"
      aria-label="Hablarle a Jarvis (Alt+J)"
      title="Hablarle (Alt+J): apretá para empezar y otra vez para terminar"
      disabled={ears.phase === 'transcribing' || ears.phase === 'preparing'}
      onClick={() => talkToJarvis(jarvisId)}
    >
      <span className="material-symbols-sharp text-lg" aria-hidden="true">
        mic
      </span>
    </Button>
  );
}

/**
 * Jarvis's chat: who it is and how it is, what a card would offer (Hecho,
 * terminal, Editar, ✕), what its ears say, and the conversation with its box
 * to write or talk. With no Jarvis it offers to call one. The bubble floats it
 * over the office; the Control view keeps it fixed in its own column.
 */
/** The ask you are answering, quoted above the box; ✕ drops it. */
function ReplyQuote({ reply }: { reply: ReplyTarget }) {
  return (
    <div className="mx-10 mb-6 flex items-start gap-8 border-l-2 border-accent pl-8 pr-2 py-2">
      <span className="flex-1 min-w-0 text-2xs text-text-2">
        <span className="font-mono text-accent">{reply.id}</span> Respondés a{' '}
        {reply.from === 'Jarvis' ? 'Jarvis' : `«${reply.from}»`}:{' '}
        <span className="text-text line-clamp-2">{reply.text}</span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-label="No responder a ese pendiente"
        title="Escribir sin citarlo"
        onClick={clearReply}
      >
        ✕
      </Button>
    </div>
  );
}

export function JarvisChat({
  jarvis,
  actions,
  state,
  onSummon,
  composerFocus,
  headerButtons,
  asked,
  aboveBox,
  permissionsOnly = false,
  shapeText,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  state: JarvisChatState;
  /** Opens the launch dialog for a Jarvis (absent: this office cannot launch). */
  onSummon?: () => void;
  /** Changes when something wants the box to write to it focused. */
  composerFocus: number;
  /** The host's own buttons in the header (the bubble's grow and minimize). */
  headerButtons?: ReactNode;
  /** Another agent's permission Jarvis asks you about. */
  asked?: AskedPermission;
  /** The host's own strip right above the box (the Asistente's decision cards). */
  aboveBox?: ReactNode;
  /** Its «Te toca:» is already a card elsewhere: above the box, only permissions. */
  permissionsOnly?: boolean;
  /** What you write, as it goes (a meeting's note). */
  shapeText?: (text: string) => string;
}) {
  const { voice, notice, earsLine, noteText, note, mood, speaks, ears } = state;
  const reply = useReplyTarget();
  // Answering an ask: its id, who asked and what, go with your words.
  const send = (id: number, typed: string, images?: readonly string[]) => {
    const text = shapeText ? shapeText(typed) : typed;
    return sendToAgent(id, reply ? replyText(reply, text) : text, images).then((sent) => {
      if (sent && reply) clearReply();
      return sent;
    });
  };
  return (
    <>
      <header className="shrink-0 flex items-start gap-10 px-14 py-10 border-b border-border bg-bg-dark">
        <JarvisRing mood={mood} size={30} />
        <div className="flex-1 min-w-0">
          <div className="text-2xs font-bold tracking-[0.14em] text-jarvis">JARVIS</div>
          <p
            className="m-0 text-xs leading-snug text-text-2 line-clamp-2"
            title={jarvis ? jarvisLine(jarvis) : undefined}
          >
            {jarvis ? jarvisLine(jarvis) : 'No está en la oficina.'}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2 -mr-6">
          {jarvis && speaks && (
            <Button
              size="icon"
              className="w-32! h-32!"
              variant="ghost"
              aria-pressed={voice.muted}
              aria-label={voice.muted ? 'Que Jarvis hable' : 'Silenciar a Jarvis'}
              title={voice.muted ? 'Que hable' : 'Silenciarlo'}
              onClick={() => setJarvisMuted(!voice.muted)}
            >
              <span className="material-symbols-sharp text-lg" aria-hidden="true">
                {voice.muted ? 'volume_off' : 'volume_up'}
              </span>
            </Button>
          )}
          {headerButtons}
        </div>
      </header>
      {jarvis && (
        // It has no card: what a card offers (terminal, Editar, ✕) lives here.
        // Editar relaunches it with its current role.
        // «Hecho» for what it asks lives above the box (JarvisAsk), once.
        <div className="shrink-0 flex flex-wrap items-center gap-4 px-10 py-4 border-b border-border">
          <span className="flex-1" />
          {actions.onOpenTerminal && (
            <Button size="sm" variant="ghost" onClick={() => actions.onOpenTerminal?.(jarvis.id)}>
              Ver su terminal
            </Button>
          )}
          {actions.onEdit && (
            <Button size="sm" variant="ghost" onClick={() => actions.onEdit?.(jarvis.id)}>
              Editar
            </Button>
          )}
          {actions.onClose && (
            <Button size="sm" variant="ghost" onClick={() => actions.onClose?.(jarvis.id)}>
              Cerrar a Jarvis
            </Button>
          )}
        </div>
      )}
      {(notice || earsLine || noteText) && (
        <div className="shrink-0 flex flex-col gap-4 px-14 py-6 border-b border-border">
          <JarvisStatusLines state={state} />
          {noteText && <HeardNote text={noteText} note={note} boxed={false} />}
        </div>
      )}
      {jarvis ? (
        <div className="relative flex-1 min-h-0">
          <ChatPane
            view={jarvis}
            actions={actions}
            onSend={(text, images) => send(jarvis.id, text, images)}
            onShowTerminal={() => actions.onOpenTerminal?.(jarvis.id)}
            composerLeading={<MicButton jarvisId={jarvis.id} ears={ears} />}
            composerTop={
              <>
                {aboveBox}
                <JarvisAsk
                  jarvis={jarvis}
                  asked={asked}
                  actions={actions}
                  variant="docked"
                  permissionsOnly={permissionsOnly}
                />
                {reply && <ReplyQuote reply={reply} />}
              </>
            }
            focusSignal={composerFocus}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 px-24 text-center">
          <JarvisRing mood="away" size={48} />
          <p className="m-0 text-sm text-text-2">Jarvis no está en la oficina.</p>
          {onSummon && (
            <Button size="md" variant="accent" onClick={onSummon}>
              Llamar a Jarvis
            </Button>
          )}
        </div>
      )}
    </>
  );
}
