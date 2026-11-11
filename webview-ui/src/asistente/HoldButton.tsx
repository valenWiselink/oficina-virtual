import { useRef, useState } from 'react';

/** How long it must be held. */
export const HOLD_MS = 1200;

/**
 * A button that acts only when held down (mouse, touch, or Enter / Space):
 * for what must not happen by a slip or by voice, like a merge. It fills up
 * while held; letting go early does nothing.
 */
export function HoldButton({ label, onHeld }: { label: string; onHeld: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = () => {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onHeld();
    }, HOLD_MS);
  };
  const stop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  return (
    <button
      type="button"
      title={`Mantené apretado ${HOLD_MS / 1000} s`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={stop}
      onBlur={stop}
      className="relative overflow-hidden rounded-md border border-accent bg-bg px-10 py-4 text-xs font-semibold text-text cursor-pointer select-none touch-none focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-accent/40"
        style={{
          width: holding ? '100%' : '0%',
          transition: holding ? `width ${HOLD_MS}ms linear` : 'width 150ms ease-out',
        }}
      />
      <span className="relative">{label}</span>
    </button>
  );
}
