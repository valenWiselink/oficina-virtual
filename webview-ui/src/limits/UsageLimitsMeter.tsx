import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { useNow } from '../hooks/useNow.js';
import {
  formatObserved,
  LIMIT_FILL,
  LIMIT_TEXT,
  limitsTitle,
  limitViews,
  type UsageLimits,
  type WindowView,
  worstView,
} from './usageLimits.js';
import { setUsageLimitsEnabled, useUsageLimits } from './usageLimitsStore.js';

/**
 * The plan's usage limits, always in sight: the 5-hour session and the week
 * as two small bars (one number when the office is narrow). Hover says when
 * each resets; a click opens the detail and the switch. In the toolbar
 * (bottom, opens up) or floating at the top on a phone (opens down).
 */
export function UsageLimitsMeter({ floating = false }: { floating?: boolean }) {
  const msg = useUsageLimits();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  if (!msg) return null;
  const views = limitViews(msg, now);
  return (
    <div ref={ref} className="relative flex items-center gap-6">
      {!floating && <span className="w-1 h-24 bg-border" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? undefined : limitsTitle(msg, now)}
        aria-expanded={open}
        aria-label="Tus límites de Claude"
        className={`flex items-center gap-10 rounded-lg px-8 py-5 cursor-pointer hover:bg-btn-hover outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          floating ? 'border border-border bg-btn-bg shadow-soft' : 'border-0 bg-transparent'
        }`}
      >
        {msg.setup === 'ours' ? <Meters views={views} /> : <Unset />}
      </button>
      {open && (
        <LimitsPanel
          msg={msg}
          views={views}
          now={now}
          place={floating ? 'top-full left-0 mt-8' : 'bottom-full right-0 mb-12'}
        />
      )}
    </div>
  );
}

/** Close on a press outside `ref` or on Escape (the dropdown convention). */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPress = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPress);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPress);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

function Meters({ views }: { views: [WindowView, WindowView] }) {
  const worst = worstView(views);
  // From 840px of office (an `@container`) both bars fit next to the
  // toolbar's buttons; below that the meter is one number.
  return (
    <>
      <span className="hidden @min-[840px]:flex items-center gap-12">
        <Meter view={views[0]} label="5 h" />
        <Meter view={views[1]} label="Semana" />
      </span>
      <span className="flex @min-[840px]:hidden items-center gap-5">
        <span
          className={`w-8 h-8 rounded-full ${worst ? LIMIT_FILL[worst.level] : 'bg-border'}`}
          aria-hidden="true"
        />
        <span
          className={`text-xs font-semibold ${worst ? LIMIT_TEXT[worst.level] : 'text-text-muted'}`}
        >
          {worst ? `${worst.pct} %` : '–'}
        </span>
      </span>
    </>
  );
}

function Meter({ view, label }: { view: WindowView; label: string }) {
  const empty = view.pct === null;
  return (
    <span className="flex items-center gap-5">
      <span className="text-2xs font-semibold text-text-muted">{label}</span>
      <Bar view={view} className="w-36 h-5" />
      <span
        className={`text-xs tabular-nums ${empty ? 'text-text-muted font-medium' : `font-semibold ${LIMIT_TEXT[view.level]}`}`}
      >
        {empty ? 'sin dato' : `${view.pct} %`}
      </span>
    </span>
  );
}

function Bar({ view, className }: { view: WindowView; className: string }) {
  return (
    <span
      className={`relative block rounded-full bg-border overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {view.pct !== null && (
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${LIMIT_FILL[view.level]}`}
          style={{ width: `${view.pct}%` }}
        />
      )}
    </span>
  );
}

/** Not on yet (or not possible): an icon, and the word when there is room. */
function Unset() {
  return (
    <span className="flex items-center gap-4 text-sm font-medium text-text-muted">
      <span className="material-symbols-sharp text-base" aria-hidden="true">
        speed
      </span>
      <span className="hidden @min-[840px]:inline">Límites</span>
    </span>
  );
}

function LimitsPanel({
  msg,
  views,
  now,
  place,
}: {
  msg: UsageLimits;
  views: [WindowView, WindowView];
  now: number;
  /** Where it opens, relative to the meter (Tailwind position classes). */
  place: string;
}) {
  return (
    <div
      className={`absolute ${place} z-30 w-[min(300px,calc(100vw-32px))] soft-panel p-12 flex flex-col gap-10 text-text`}
      role="dialog"
      aria-label="Tus límites de Claude"
    >
      <h3 className="m-0 text-sm font-semibold">Tus límites de Claude</h3>
      {msg.setup === 'ours' ? (
        <LimitsDetail msg={msg} views={views} now={now} />
      ) : (
        <SetupHelp msg={msg} />
      )}
      {msg.error && <p className="m-0 text-xs text-danger">No pude cambiarlo: {msg.error}</p>}
    </div>
  );
}

function LimitsDetail({
  msg,
  views,
  now,
}: {
  msg: UsageLimits;
  views: [WindowView, WindowView];
  now: number;
}) {
  const observed = formatObserved(msg.observedAt, now);
  return (
    <>
      {views.map((v) => (
        <div key={v.label} className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">{v.label}</span>
            <span
              className={
                v.pct === null ? 'text-text-muted' : `font-semibold ${LIMIT_TEXT[v.level]}`
              }
            >
              {v.pct === null ? 'sin dato' : `${v.pct} % usado`}
            </span>
          </div>
          <Bar view={v} className="w-full h-6" />
          {v.reset && <span className="text-2xs text-text-muted">{v.reset}</span>}
        </div>
      ))}
      <p className="m-0 text-2xs text-text-muted">
        {observed
          ? `Los números vienen de Claude Code (${observed}).`
          : 'Todavía no llegó ningún número.'}{' '}
        Se actualizan con cada respuesta de un agente.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setUsageLimitsEnabled(false)}
      >
        Dejar de mostrarlos
      </Button>
    </>
  );
}

function SetupHelp({ msg }: { msg: UsageLimits }) {
  if (msg.setup === 'foreign') {
    return (
      <p className="m-0 text-xs text-text-muted">
        Ya tenés una barra de estado propia en Claude Code y la oficina no la toca. Para ver acá tus
        límites, sacala de <code>~/.claude/settings.json</code> y activalos desde este botón.
      </p>
    );
  }
  if (msg.setup === 'unknown') {
    return (
      <p className="m-0 text-xs text-text-muted">
        No pude leer tu <code>~/.claude/settings.json</code>. Fijate que no tenga un error y probá
        de nuevo.
      </p>
    );
  }
  return (
    <>
      <p className="m-0 text-xs text-text-muted">
        Para mostrarte cuánto usaste de la sesión de 5 horas y de la semana, la oficina le suma a
        Claude Code una barra de estado: una línea abajo en la terminal de cada agente.
      </p>
      <p className="m-0 text-xs text-text-muted">
        Los números llegan con la próxima respuesta de un agente.
      </p>
      <Button
        variant="accent"
        size="sm"
        className="self-start"
        onClick={() => setUsageLimitsEnabled(true)}
      >
        Mostrar mis límites
      </Button>
    </>
  );
}
