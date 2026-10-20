import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { markTourDone } from './onboardingStore.js';
import { placeBubble, type Rect } from './tourPlacement.js';
import { TOUR_STEPS } from './tourSteps.js';

/** Room around the highlighted element. */
const SPOTLIGHT_PAD_PX = 6;
const BUBBLE_WIDTH_PX = 300;
/** How often the open tour re-measures its target. */
const REMEASURE_MS = 300;

const targetOf = (name: string) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`);

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - SPOTLIGHT_PAD_PX,
    y: r.top - SPOTLIGHT_PAD_PX,
    w: r.width + SPOTLIGHT_PAD_PX * 2,
    h: r.height + SPOTLIGHT_PAD_PX * 2,
  };
}

/**
 * The guided tour: the window dims, one part of the office lights up, and a
 * bubble beside it says what it is for. Stops whose element is not on screen
 * are skipped. Esc or «Saltar» ends it; either way it counts as seen.
 */
export function Tour({ onClose }: { onClose: () => void }) {
  const [steps] = useState(() => TOUR_STEPS.filter((s) => targetOf(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const step = steps[index];

  const finish = useCallback(() => {
    markTourDone();
    onClose();
  }, [onClose]);
  const next = useCallback(() => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else finish();
  }, [index, steps.length, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Measure the target, then the bubble, on every stop, on window resize and
  // every moment in between: the office reflows under the tour (the panel
  // opening beside the board moved the columns after the first measure).
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = targetOf(step.target);
      if (!el) return;
      const r = rectOf(el);
      setRect((prev) =>
        prev && prev.x === r.x && prev.y === r.y && prev.w === r.w && prev.h === r.h ? prev : r,
      );
      const b = bubbleRef.current?.getBoundingClientRect();
      const placed = placeBubble(
        r,
        { w: BUBBLE_WIDTH_PX, h: b?.height ?? 160 },
        { w: window.innerWidth, h: window.innerHeight },
      );
      setPos((prev) =>
        prev && prev.x === placed.x && prev.y === placed.y ? prev : { x: placed.x, y: placed.y },
      );
    };
    measure();
    // Once more after the bubble has its real height for this text.
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    const timer = setInterval(measure, REMEASURE_MS);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [finish, next, back]);

  useEffect(() => {
    if (steps.length === 0) onClose();
  }, [steps.length, onClose]);

  if (!step) return null;
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Guía">
      {rect && (
        <div
          className="tour-spotlight fixed rounded-xl pointer-events-none transition-all duration-200"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      )}
      <div
        ref={bubbleRef}
        className="fixed soft-panel p-16 flex flex-col gap-8 transition-[left,top] duration-200"
        style={{
          width: BUBBLE_WIDTH_PX,
          left: pos?.x ?? -9999,
          top: pos?.y ?? -9999,
        }}
      >
        <span className="text-2xs font-medium text-text-muted">
          {index + 1} de {steps.length}
        </span>
        <span className="text-base font-semibold text-text">{step.title}</span>
        <p className="m-0 text-sm text-text-muted leading-relaxed">{step.text}</p>
        <div className="flex items-center gap-6 pt-4">
          <Button variant="ghost" size="sm" onClick={finish}>
            Saltar
          </Button>
          <span className="ml-auto flex gap-6">
            {index > 0 && (
              <Button size="sm" onClick={back}>
                Anterior
              </Button>
            )}
            <Button variant="accent" size="sm" onClick={next} autoFocus>
              {last ? 'Listo' : 'Siguiente'}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
