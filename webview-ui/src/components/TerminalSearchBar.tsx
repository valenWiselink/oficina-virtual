import { useEffect, useState } from 'react';

import type { TerminalSearchHandle } from '../terminal/terminalAddons.js';
import { Button } from './ui/Button.js';

/**
 * Find in a terminal's output: typing searches as you go, Enter / Shift+Enter
 * (or the arrows) move between matches, "3 de 12" says where you are, Esc
 * closes and clears the highlights.
 */
export function TerminalSearchBar({
  handle,
  onClose,
}: {
  handle: TerminalSearchHandle;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ index: number; count: number } | null>(null);
  useEffect(() => handle.onResults((index, count) => setResults({ index, count })), [handle]);

  const label =
    !query || !results
      ? ''
      : results.count === 0
        ? 'Sin resultados'
        : `${results.index + 1} de ${results.count}`;

  return (
    <div className="absolute top-6 right-6 pointer-events-auto soft-panel flex items-center gap-4 px-6 py-3">
      <input
        autoFocus
        value={query}
        placeholder="Buscar en la terminal"
        aria-label="Buscar en la terminal"
        className="w-150 text-xs bg-bg-dark text-text border border-border rounded-md px-6 py-3"
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value) handle.next(e.target.value);
          else handle.clear();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'Enter' && e.shiftKey) handle.previous(query);
          else if (e.key === 'Enter') handle.next(query);
        }}
      />
      <span className="text-2xs text-text-muted tabular-nums w-80 text-center">{label}</span>
      <Button
        size="icon"
        variant="ghost"
        title="Anterior (Shift+Enter)"
        onClick={() => handle.previous(query)}
      >
        ↑
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title="Siguiente (Enter)"
        onClick={() => handle.next(query)}
      >
        ↓
      </Button>
      <Button size="icon" variant="ghost" title="Cerrar (Esc)" onClick={onClose}>
        ×
      </Button>
    </div>
  );
}
