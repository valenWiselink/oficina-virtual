import { type RefObject, useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { HeardNote, JarvisChat, JarvisStatusLines } from './JarvisChat.js';
import { useJarvisChatState } from './jarvisChatState.js';
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
import { bubbleTitle } from './jarvisRules.js';
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
  const state = useJarvisChatState(jarvis, open);
  const { voice, notice, earsLine, note, noteText, mood, listening, needsYou } = state;

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

  const close = () => {
    setOpen(false);
    bubble.current?.focus();
  };

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
          <JarvisChat
            jarvis={jarvis}
            actions={actions}
            state={state}
            onSummon={onSummon}
            composerFocus={composerFocus}
            headerButtons={
              <>
                <Button
                  size="icon"
                  className="w-32! h-32!"
                  variant="ghost"
                  aria-pressed={size.max}
                  aria-label={
                    size.max ? 'Volver al alto de antes' : 'Agrandar el chat hasta arriba'
                  }
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
              </>
            }
          />
        </aside>
      )}

      {/* Closed: what its ears or its voice have to say, beside the bubble. */}
      {!open && (notice || earsLine || noteText) && (
        <div className="absolute right-84 bottom-16 z-30 w-[min(340px,calc(100%-100px))] flex flex-col gap-8">
          {(notice || earsLine) && (
            <div className="soft-panel px-12 py-8 flex flex-col gap-4">
              <JarvisStatusLines state={state} />
            </div>
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
