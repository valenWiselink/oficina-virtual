import { useEffect, useMemo, useRef, useState } from 'react';

import { useFocus } from '../focus/focusMode.js';
import type { AgentView } from '../views/agentViews.js';
import {
  buildCommands,
  filterCommands,
  type PaletteActions,
  type PaletteCommand,
} from './commands.js';

interface CommandPaletteProps extends PaletteActions {
  open: boolean;
  onClose: () => void;
  views: AgentView[];
  /** The workspace an agent is in, shown beside its status. */
  spaceOf?: (view: AgentView) => string | undefined;
}

/**
 * The quick palette (Ctrl+K): type a few letters of an agent or an action,
 * arrows to move, Enter to go, Esc to close. Mounted fresh each time it
 * opens, so it always starts empty.
 */
export function CommandPalette({ open, ...props }: CommandPaletteProps) {
  if (!open) return null;
  return <PaletteBody {...props} />;
}

function PaletteBody({ onClose, views, spaceOf, ...actions }: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const focused = useFocus().active;
  const commands = useMemo(
    () => buildCommands(views, actions, focused, spaceOf),
    // The callbacks are new every render; the list only depends on these.
    [views, focused, spaceOf], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + shown.length) % Math.max(1, shown.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(shown[current]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-text/20 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta rápida"
        className="fixed left-1/2 -translate-x-1/2 top-[12vh] z-[71] w-[min(520px,calc(100%-32px))] soft-panel flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-8 px-12 py-10 border-b border-border">
          <span className="material-symbols-sharp text-base text-text-muted" aria-hidden="true">
            search
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Buscá un agente o una acción…"
            aria-label="Buscar"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-text placeholder:text-text-muted"
          />
          <kbd className="text-2xs text-text-muted border border-border rounded px-4">Esc</kbd>
        </div>
        <PaletteList
          list={shown}
          current={current}
          listRef={listRef}
          onPick={run}
          onHover={setActive}
        />
      </div>
    </>
  );
}

function PaletteList({
  list,
  current,
  listRef,
  onPick,
  onHover,
}: {
  list: PaletteCommand[];
  current: number;
  listRef: React.RefObject<HTMLUListElement | null>;
  onPick: (command: PaletteCommand) => void;
  onHover: (index: number) => void;
}) {
  if (list.length === 0) {
    return <p className="m-0 px-14 py-12 text-sm text-text-muted">No encontré nada con eso.</p>;
  }
  return (
    <ul
      ref={listRef}
      role="listbox"
      className="m-0 p-4 list-none max-h-[50vh] overflow-y-auto thin-scrollbar"
    >
      {list.map((c, i) => (
        <li
          key={c.id}
          role="option"
          aria-selected={i === current}
          data-index={i}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          className={`flex items-center gap-10 px-10 py-6 rounded-lg cursor-pointer ${
            i === current ? 'bg-active-bg' : ''
          }`}
        >
          <span className="material-symbols-sharp text-base text-text-muted" aria-hidden="true">
            {c.icon}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="text-sm text-text truncate">{c.label}</span>
            {c.hint && <span className="text-2xs text-text-muted truncate">{c.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
