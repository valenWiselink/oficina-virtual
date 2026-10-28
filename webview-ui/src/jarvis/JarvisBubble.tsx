import { useEffect, useRef, useState } from 'react';

import { ChatPane } from '../chat/ChatPane.js';
import { Button } from '../components/ui/Button.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { clock, MAX_DICTATION_MS } from './dictation.js';
import { type EarsState, useJarvisEars } from './jarvisEars.js';
import { dismissJarvisNotice, useJarvisNotice } from './jarvisNotice.js';
import { JarvisRing } from './JarvisRing.js';
import { jarvisLine, jarvisMood } from './jarvisRules.js';
import { requestJarvisVoice, setJarvisMuted, useJarvisVoice } from './jarvisVoice.js';
import { talkToJarvis } from './talk.js';

/** Whether its panel was open, for this tab (a reload keeps it). */
const OPEN_KEY = 'jarvis:abierto';

function readOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function keepOpen(open: boolean): void {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked: it just opens closed next time.
  }
}

/** How long it has been listening, «0:42». */
function ListenClock({ since }: { since: number | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{clock(Math.max(0, now - (since ?? now)))}</span>;
}

/** What its ears are doing, in words (undefined: nothing to say). */
function earsLineOf(ears: EarsState): string | undefined {
  if (ears.phase === 'listening')
    return `Te escucho, tomate tu tiempo: no corto por silencio. Cuando termines, apretá de nuevo el micrófono o Alt+J y se lo paso (se corta solo a los ${clock(MAX_DICTATION_MS)}).`;
  if (ears.phase === 'transcribing') return 'Escribiendo lo que dijiste…';
  if (ears.phase === 'preparing')
    return `Preparando el oído de Jarvis${ears.percent !== undefined ? ` (${ears.percent} %)` : ''}: la primera vez baja el modelo de voz.`;
  if (ears.error) return ears.error;
  if (ears.heard)
    return `${ears.full ? `Llegaste a los ${clock(MAX_DICTATION_MS)} y se lo pasé. ` : ''}Le dijiste: «${ears.heard}»`;
  return undefined;
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
 * Jarvis as a floating assistant in the office's corner (asked 2026-10-28,
 * after the Wiselink webapp's help bubble): a round button that opens its
 * chat in a panel above it and closes it again, so it never covers the
 * office. The button shows how it is (working, needs you, listening); what
 * its ears or its voice have to say shows beside it while the panel is
 * closed. When it needs you it still comes to the middle of the screen
 * (JarvisVisor). With no Jarvis in the office the panel offers to call one.
 */
export function JarvisBubble({
  jarvis,
  actions,
  onSummon,
  focusSignal,
}: {
  jarvis: AgentView | undefined;
  actions: BoardActions;
  /** Opens the launch dialog for a Jarvis (absent: this office cannot launch). */
  onSummon?: () => void;
  /** Changes when something (the visor's «Escribirle») wants to write to it. */
  focusSignal: number;
}) {
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    keepOpen(next);
  };
  // The panel appears from the bubble: one frame closed, then open.
  const [shown, setShown] = useState(false);
  const [composerFocus, setComposerFocus] = useState(0);
  const bubble = useRef<HTMLButtonElement>(null);
  const voice = useJarvisVoice();
  const ears = useJarvisEars();
  const notice = useJarvisNotice();
  useEffect(() => requestJarvisVoice(), []);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (focusSignal === 0) return;
    setOpen(true);
    // After the panel renders its box.
    requestAnimationFrame(() => setComposerFocus((n) => n + 1));
  }, [focusSignal]);

  const mood = jarvis ? (voice.speaking ? 'busy' : jarvisMood(jarvis)) : 'away';
  const listening = ears.phase === 'listening';
  const needsYou = !!jarvis && (jarvis.kind === 'needs' || !!jarvis.permission);
  const earsLine = earsLineOf(ears);
  const speaks = !!voice.status && voice.status.engine !== 'off';
  const turnId = jarvis?.kind === 'needs' ? jarvis.yourTurnId : undefined;
  const close = () => {
    setOpen(false);
    bubble.current?.focus();
  };

  const statusLines = (
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

  return (
    <>
      {open && (
        <aside
          aria-label="Jarvis"
          className={`absolute right-16 bottom-84 z-30 w-[min(440px,calc(100%-32px))] h-[min(640px,calc(100%-100px))] min-h-280 flex flex-col overflow-hidden soft-panel rounded-2xl! origin-bottom-right transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
            shown ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) close();
          }}
        >
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
              <Button
                size="icon"
                className="w-32! h-32!"
                variant="ghost"
                aria-label="Minimizar a Jarvis (Esc)"
                title="Minimizar (Esc)"
                onClick={close}
              >
                <span className="material-symbols-sharp text-lg" aria-hidden="true">
                  remove
                </span>
              </Button>
            </div>
          </header>
          {jarvis && (
            // It has no card: what a card offers (terminal, Editar, ✕) lives here.
            // Editar relaunches it with its current role.
            <div className="shrink-0 flex flex-wrap items-center gap-4 px-10 py-4 border-b border-border">
              {turnId && actions.onYourTurnDone && (
                <Button size="sm" onClick={() => actions.onYourTurnDone?.(turnId)}>
                  Hecho
                </Button>
              )}
              <span className="flex-1" />
              {actions.onOpenTerminal && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.onOpenTerminal?.(jarvis.id)}
                >
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
          {(notice || earsLine) && (
            <div className="shrink-0 flex flex-col gap-4 px-14 py-6 border-b border-border">
              {statusLines}
            </div>
          )}
          {jarvis ? (
            <div className="relative flex-1 min-h-0">
              <ChatPane
                view={jarvis}
                actions={actions}
                onSend={(text, images) => sendToAgent(jarvis.id, text, images)}
                onShowTerminal={() => actions.onOpenTerminal?.(jarvis.id)}
                composerLeading={<MicButton jarvisId={jarvis.id} ears={ears} />}
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
        </aside>
      )}

      {/* Closed: what its ears or its voice have to say, beside the bubble. */}
      {!open && (listening || notice || earsLine) && (
        <div className="absolute right-84 bottom-16 z-30 w-[min(340px,calc(100%-100px))] soft-panel px-12 py-8 flex flex-col gap-4">
          {statusLines}
        </div>
      )}

      <button
        ref={bubble}
        type="button"
        aria-label={
          open ? 'Minimizar a Jarvis' : needsYou ? 'Jarvis te necesita: abrirlo' : 'Abrir a Jarvis'
        }
        aria-expanded={open}
        title={jarvis ? (open ? 'Minimizar' : jarvisLine(jarvis)) : 'Jarvis'}
        onClick={() => setOpen(!open)}
        className={`absolute right-16 bottom-16 z-30 w-56 h-56 rounded-full border-0 p-0 cursor-pointer flex items-center justify-center shadow-soft transition-transform duration-150 ease-out hover:scale-105 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jarvis ${
          listening ? 'bg-danger' : jarvis ? 'bg-jarvis' : 'bg-bg border border-border'
        }`}
      >
        {open ? (
          <span
            className={`material-symbols-sharp text-2xl ${jarvis ? 'text-white' : 'text-text-2'}`}
            aria-hidden="true"
          >
            close
          </span>
        ) : listening ? (
          <span
            className="material-symbols-sharp text-2xl text-white soft-pulse"
            aria-hidden="true"
          >
            mic
          </span>
        ) : (
          <JarvisRing mood={mood} size={38} onColor={!!jarvis} />
        )}
        {needsYou && !open && (
          <span
            className="absolute top-0 right-0 w-14 h-14 rounded-full bg-status-permission border-2 border-bg soft-pulse"
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}
