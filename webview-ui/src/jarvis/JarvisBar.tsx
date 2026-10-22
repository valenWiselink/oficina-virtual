import { useEffect, useRef, useState } from 'react';

import { ChatPane } from '../chat/ChatPane.js';
import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { ChoiceReplies } from '../views/CardExtras.js';
import { JarvisRing } from './JarvisRing.js';
import { jarvisLine, jarvisMood } from './jarvisRules.js';

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

  return (
    <section
      aria-label="Jarvis"
      className="shrink-0 border-t border-border bg-bg-dark flex flex-col"
    >
      {open && (
        <div className="relative overflow-hidden h-[min(420px,45vh)] min-h-0 flex border-b border-border bg-bg">
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
        <JarvisRing mood={jarvisMood(jarvis)} />
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
        {!open && (
          <form
            className="flex items-center gap-6 flex-[1_1_300px] min-w-0"
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
        <Button
          size="icon_lg"
          variant="ghost"
          aria-expanded={open}
          aria-label={open ? 'Cerrar la conversación con Jarvis' : 'Ver la conversación con Jarvis'}
          title={open ? 'Cerrar la conversación' : 'Ver la conversación'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="material-symbols-sharp text-lg" aria-hidden="true">
            {open ? 'expand_more' : 'expand_less'}
          </span>
        </Button>
        {state === 'failed' && (
          <p className="m-0 basis-full text-2xs text-danger" role="status">
            No le llegó: su terminal no está conectada. Probá de nuevo en un momento.
          </p>
        )}
      </div>
    </section>
  );
}
