import { useEffect } from 'react';

/** How long the notice stays over the terminal. */
const NOTICE_MS = 10_000;

/**
 * Over a terminal: what you typed while it reconnected did not go. The gray
 * line written into the terminal itself does not last — the reattach and
 * Claude Code's own repaints draw over it — so this says it where it stays.
 * `at` is when it happened (null: nothing to say).
 */
export function InputDroppedNotice({ at, onDone }: { at: number | null; onDone: () => void }) {
  useEffect(() => {
    if (at === null) return;
    const timer = setTimeout(onDone, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [at, onDone]);
  if (at === null) return null;
  return (
    <div
      role="status"
      className="absolute left-8 right-8 bottom-8 z-10 flex items-center gap-8 rounded-lg border border-status-permission bg-status-permission-bg px-10 py-6 text-xs text-status-permission-text shadow-soft"
    >
      <span className="flex-1">
        No le llegó lo que escribiste mientras la terminal se reconectaba. Escribilo de nuevo.
      </span>
      <button
        type="button"
        aria-label="Cerrar el aviso"
        className="border-0 bg-transparent p-0 cursor-pointer text-status-permission-text"
        onClick={onDone}
      >
        ×
      </button>
    </div>
  );
}
