import { type RefObject, useEffect, useRef, useState } from 'react';

import { ChatPane } from '../chat/ChatPane.js';
import { Button } from '../components/ui/Button.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { clock, MAX_DICTATION_MS } from './dictation.js';
import { heardNoteMs, heardNoteOf, useFleetingNote } from './heardNote.js';
import { type EarsState, useJarvisEars } from './jarvisEars.js';
import { dismissJarvisNotice, useJarvisNotice } from './jarvisNotice.js';
import {
  fitPanel,
  PANEL_MIN_CSS,
  PANEL_MIN_PX,
  PANEL_STEP_PX,
  panelHeightCss,
  type PanelSize,
  toggleMax,
  useJarvisPanelSize,
} from './jarvisPanelSize.js';
import { JarvisRing } from './JarvisRing.js';
import { bubbleTitle, jarvisLine, jarvisMood } from './jarvisRules.js';
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

/** What its ears are doing, in words (undefined: nothing to say). What it
 *  heard is not here: that is a fleeting note (heardNote.ts). */
function earsLineOf(ears: EarsState): string | undefined {
  if (ears.phase === 'listening')
    return `Te escucho, tomate tu tiempo: no corto por silencio. Cuando termines, apretá de nuevo el micrófono o Alt+J y se lo paso (se corta solo a los ${clock(MAX_DICTATION_MS)}).`;
  if (ears.phase === 'transcribing') return 'Escribiendo lo que dijiste…';
  if (ears.phase === 'preparing')
    return `Preparando el oído de Jarvis${ears.percent !== undefined ? ` (${ears.percent} %)` : ''}: la primera vez baja el modelo de voz.`;
  if (ears.error) return ears.error;
  return undefined;
}

/** What it heard, for a moment: hovering holds it, a tap closes it. */
function HeardNote({
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

/** The height of the office the panel floats in. */
function roomOf(panel: RefObject<HTMLElement | null>): number {
  return (panel.current?.offsetParent as HTMLElement | null)?.clientHeight ?? 0;
}

/**
 * The panel's top edge: drag it (or ↑/↓ on it) to make the chat taller or
 * shorter, up to the top of the office; a double click maximizes or restores.
 */
function PanelEdge({
  panel,
  size,
  onSize,
}: {
  panel: RefObject<HTMLElement | null>;
  size: PanelSize;
  onSize: (next: PanelSize, keep?: boolean) => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const resize = (height: number, keep: boolean) => onSize(fitPanel(height, roomOf(panel)), keep);
  const dragged = (y: number) => (drag.current ? drag.current.height + drag.current.y - y : 0);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Alto del chat de Jarvis"
      aria-valuemin={PANEL_MIN_PX}
      aria-valuenow={size.height}
      tabIndex={0}
      title="Arrastrá para cambiarle el alto (doble clic: hasta arriba o de vuelta)"
      className="absolute top-0 inset-x-0 z-10 h-8 cursor-ns-resize touch-none outline-none transition-colors hover:bg-jarvis/30 focus-visible:bg-jarvis/50"
      onPointerDown={(e) => {
        if (e.button !== 0 || !panel.current) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, height: panel.current.offsetHeight };
      }}
      onPointerMove={(e) => {
        if (drag.current) resize(dragged(e.clientY), false);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        resize(dragged(e.clientY), true);
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onSize(toggleMax(size, roomOf(panel)))}
      onKeyDown={(e) => {
        const step =
          e.key === 'ArrowUp' ? PANEL_STEP_PX : e.key === 'ArrowDown' ? -PANEL_STEP_PX : 0;
        if (!step || !panel.current) return;
        e.preventDefault();
        resize(panel.current.offsetHeight + step, true);
      }}
    />
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
  const panel = useRef<HTMLElement>(null);
  const [size, setSize] = useJarvisPanelSize();
  const voice = useJarvisVoice();
  const ears = useJarvisEars();
  const voiceNotice = useJarvisNotice();
  // Which engine speaks is no news while you muted it (it shows if you unmute).
  const notice = voice.muted ? undefined : voiceNotice;
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
  const note = useFleetingNote(
    ears.heard ? ears.heardAt : undefined,
    heardNoteMs(ears.heard ?? ''),
  );
  const noteText = note.phase === 'gone' ? undefined : heardNoteOf(ears, open);
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
          ref={panel}
          aria-label="Jarvis"
          style={{ height: panelHeightCss(size), minHeight: PANEL_MIN_CSS }}
          className={`absolute right-16 bottom-84 z-30 w-[min(440px,calc(100%-32px))] flex flex-col overflow-hidden soft-panel rounded-2xl! origin-bottom-right transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
            shown ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) close();
          }}
        >
          <PanelEdge panel={panel} size={size} onSize={setSize} />
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
                aria-pressed={size.max}
                aria-label={size.max ? 'Volver al alto de antes' : 'Agrandar el chat hasta arriba'}
                title={size.max ? 'Volver al alto de antes' : 'Hasta arriba'}
                onClick={() => setSize(toggleMax(size, roomOf(panel)))}
              >
                <span className="material-symbols-sharp text-lg" aria-hidden="true">
                  {size.max ? 'close_fullscreen' : 'open_in_full'}
                </span>
              </Button>
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
          {(notice || earsLine || noteText) && (
            <div className="shrink-0 flex flex-col gap-4 px-14 py-6 border-b border-border">
              {statusLines}
              {noteText && <HeardNote text={noteText} note={note} boxed={false} />}
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
      {!open && (notice || earsLine || noteText) && (
        <div className="absolute right-84 bottom-16 z-30 w-[min(340px,calc(100%-100px))] flex flex-col gap-8">
          {(notice || earsLine) && (
            <div className="soft-panel px-12 py-8 flex flex-col gap-4">{statusLines}</div>
          )}
          {noteText && <HeardNote text={noteText} note={note} boxed />}
        </div>
      )}

      <button
        ref={bubble}
        type="button"
        aria-label={
          open ? 'Minimizar a Jarvis' : needsYou ? 'Jarvis te necesita: abrirlo' : 'Abrir a Jarvis'
        }
        aria-expanded={open}
        title={bubbleTitle(jarvis, open, voice.muted)}
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
