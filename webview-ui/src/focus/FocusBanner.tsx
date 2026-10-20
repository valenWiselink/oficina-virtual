import { Button } from '../components/ui/Button.js';
import { useNow } from '../hooks/useNow.js';
import {
  dismissFocusSummary,
  endFocus,
  minutesLeft,
  missedSummary,
  useFocus,
} from './focusMode.js';

/**
 * Focus mode at a glance, top centre: while it runs, a small pill with the
 * minutes left and "Terminar"; once it ends, what it kept quiet, until you
 * close it.
 */
export function FocusBanner() {
  const focus = useFocus();
  const now = useNow();
  if (focus.active && focus.endsAt !== undefined) {
    const left = minutesLeft(focus.endsAt, now);
    return (
      <div
        role="status"
        className="absolute left-1/2 -translate-x-1/2 top-10 z-40 soft-panel flex items-center gap-8 py-3 pl-10 pr-4 text-xs"
      >
        <span className="material-symbols-sharp text-sm text-accent" aria-hidden="true">
          do_not_disturb_on
        </span>
        <span className="text-text font-medium">Modo foco</span>
        <span className="text-text-muted">
          · {left <= 1 ? 'queda menos de 1 min' : `quedan ${left} min`}
        </span>
        <Button size="sm" variant="ghost" onClick={endFocus}>
          Terminar
        </Button>
      </div>
    );
  }
  if (!focus.ended) return null;
  return (
    <div
      role="status"
      className="anim-float-up absolute left-1/2 -translate-x-1/2 top-10 z-40 soft-panel flex items-center gap-8 py-6 pl-12 pr-4 max-w-[min(440px,calc(100%-32px))]"
    >
      <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
        self_improvement
      </span>
      <span className="text-xs text-text">
        <span className="font-semibold">Terminó el foco:</span> {missedSummary(focus.missed)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Cerrar"
        title="Cerrar"
        onClick={dismissFocusSummary}
      >
        ×
      </Button>
    </div>
  );
}
