import { useEffect, useRef, useState } from 'react';

import { ChatPane } from '../chat/ChatPane.js';
import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { ChoiceReplies } from '../views/CardExtras.js';
import { useJarvisEars } from './jarvisEars.js';
import { dismissJarvisNotice, useJarvisNotice } from './jarvisNotice.js';
import { JarvisRing } from './JarvisRing.js';
import { jarvisLine, jarvisMood } from './jarvisRules.js';
import { requestJarvisVoice, setJarvisMuted, useJarvisVoice } from './jarvisVoice.js';
import { talkToJarvis } from './talk.js';

/**
 * Jarvis at the foot of the office (option A of the 2026-10-22 canvas): its
 * ring, what it last said or needs, the buttons to answer that, and where to
 * write to it. Opens upward into its whole conversation. With no Jarvis in the
 * office it offers to call one.
 */
export function JarvisBar({
  jarvis,
  actions,
  onSummon,
  focusSignal,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  /** Opens the launch dialog for a Jarvis (absent: this office cannot launch). */
  onSummon?: () => void;
  /** Changes when something (the visor's «Contestar») wants the input focused. */
  focusSignal: number;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const voice = useJarvisVoice();
  const ears = useJarvisEars();
  const notice = useJarvisNotice();
  useEffect(() => requestJarvisVoice(), []);

  useEffect(() => {
    if (focusSignal === 0) return;
    setOpen(false);
    // After the collapse renders the input again.
    requestAnimationFrame(() => input.current?.focus());
  }, [focusSignal]);

  if (!jarvis) {
    return (
      <section
        aria-label="Jarvis"
        className="shrink-0 border-t border-border bg-bg-dark flex flex-wrap items-center gap-x-14 gap-y-6 px-16 py-10"
      >
        <JarvisRing mood="away" />
        <p className="m-0 text-sm text-text-2 flex-[999_1_240px] min-w-0">
          Jarvis no está en la oficina.
        </p>
        {onSummon && (
          <Button size="md" variant="accent" onClick={onSummon}>
            Llamar a Jarvis
          </Button>
        )}
      </section>
    );
  }

  const send = () => {
    const message = text.trim();
    if (!message || state === 'sending') return;
    setState('sending');
    void sendToAgent(jarvis.id, message).then((ok) => {
      setState(ok ? 'idle' : 'failed');
      if (ok) setText('');
    });
  };
  const turnId = jarvis.kind === 'needs' ? jarvis.yourTurnId : undefined;
  const speaks = !!voice.status && voice.status.engine !== 'off';
  const earsLine =
    ears.phase === 'listening'
      ? 'Te escucho… hablá; cuando hagas silencio, se lo paso.'
      : ears.phase === 'transcribing'
        ? 'Escribiendo lo que dijiste…'
        : ears.phase === 'preparing'
          ? `Preparando el oído de Jarvis${ears.percent !== undefined ? ` (${ears.percent} %)` : ''}: la primera vez baja el modelo de voz.`
          : ears.error
            ? ears.error
            : ears.heard
              ? `Le dijiste: «${ears.heard}»`
              : undefined;

  return (
    <section
      aria-label="Jarvis"
      className="shrink-0 border-t border-border bg-bg-dark flex flex-col"
    >
      {open && (
        <div className="relative overflow-hidden h-[min(440px,48vh)] min-h-0 flex flex-col border-b border-border bg-bg">
          {/* It has no card: what a card offers (terminal, Editar, ✕) lives here.
              Editar relaunches it with its current role. */}
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-4 px-12 py-6 border-b border-border">
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
          <div className="relative flex-1 min-w-0 min-h-0">
            <ChatPane
              view={jarvis}
              actions={actions}
              onSend={(message) => sendToAgent(jarvis.id, message)}
              onShowTerminal={() => actions.onOpenTerminal?.(jarvis.id)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-14 gap-y-8 px-16 py-10">
        <JarvisRing mood={voice.speaking ? 'busy' : jarvisMood(jarvis)} />
        <div className="flex-[999_1_320px] min-w-0">
          <div className="text-2xs font-bold tracking-[0.14em] text-jarvis">JARVIS</div>
          <p className="m-0 text-sm leading-snug text-text line-clamp-2" title={jarvisLine(jarvis)}>
            {jarvisLine(jarvis)}
          </p>
        </div>
        {jarvis.permission && actions.onAllow && actions.onDeny ? (
          <ApproveButtons
            permission={jarvis.permission}
            onAllow={actions.onAllow}
            onDeny={actions.onDeny}
          />
        ) : (
          turnId && (
            <div className="flex flex-wrap items-center gap-6">
              <ChoiceReplies view={jarvis} onSent={() => actions.onYourTurnDone?.(turnId)} />
              {actions.onYourTurnDone && (
                <Button size="sm" onClick={() => actions.onYourTurnDone?.(turnId)}>
                  Hecho
                </Button>
              )}
            </div>
          )
        )}
        {/* Talk, write, silence, open: one group against the right edge, so it
            never breaks apart (with the chat open, the icons stay right). */}
        <div className="flex items-center justify-end gap-6 flex-[1_1_440px] min-w-0">
          <Button
            size="icon_lg"
            variant={ears.phase === 'listening' ? 'active' : 'default'}
            aria-pressed={ears.phase === 'listening'}
            aria-label={
              ears.phase === 'listening' ? 'Dejar de escuchar' : 'Hablarle a Jarvis (Alt+J)'
            }
            title={ears.phase === 'listening' ? 'Dejar de escuchar' : 'Hablarle (Alt+J)'}
            disabled={ears.phase === 'transcribing' || ears.phase === 'preparing'}
            onClick={() => talkToJarvis(jarvis.id)}
          >
            <span className="material-symbols-sharp text-lg" aria-hidden="true">
              {ears.phase === 'listening' ? 'stop' : 'mic'}
            </span>
          </Button>
          {!open && (
            <form
              className="flex items-center gap-6 flex-1 min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label htmlFor="jarvis-input" className="sr-only">
                Escribile a Jarvis
              </label>
              <input
                id="jarvis-input"
                ref={input}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (state === 'failed') setState('idle');
                }}
                placeholder="Escribile a Jarvis…"
                autoComplete="off"
                className="flex-1 min-w-0 text-sm py-7 px-12 bg-bg border border-border rounded-lg text-text outline-none placeholder:text-text-muted focus:border-jarvis focus:ring-2 focus:ring-jarvis/20"
              />
              <Button type="submit" size="md" disabled={!text.trim() || state === 'sending'}>
                Enviar
              </Button>
            </form>
          )}
          {speaks && (
            <Button
              size="icon_lg"
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
          <Button
            size="icon_lg"
            variant="ghost"
            aria-expanded={open}
            aria-label={
              open ? 'Cerrar la conversación con Jarvis' : 'Ver la conversación con Jarvis'
            }
            title={open ? 'Cerrar la conversación' : 'Ver la conversación'}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="material-symbols-sharp text-lg" aria-hidden="true">
              {open ? 'expand_more' : 'expand_less'}
            </span>
          </Button>
        </div>
        {state === 'failed' && (
          <p className="m-0 basis-full text-2xs text-danger" role="status">
            No le llegó: su terminal no está conectada. Probá de nuevo en un momento.
          </p>
        )}
        {notice && (
          <div className="basis-full flex items-center gap-8" role="status">
            <p className="m-0 flex-1 min-w-0 text-2xs text-warning">{notice}</p>
            <Button size="sm" variant="ghost" onClick={dismissJarvisNotice}>
              Entendido
            </Button>
          </div>
        )}
        {earsLine && (
          <p
            className={`m-0 basis-full text-2xs ${ears.error && ears.phase === 'idle' ? 'text-danger' : 'text-text-2'}`}
            role="status"
          >
            {earsLine}
          </p>
        )}
      </div>
    </section>
  );
}
