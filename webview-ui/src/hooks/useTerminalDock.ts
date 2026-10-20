import { useCallback, useState } from 'react';

/** Which edge of the window the terminal panel docks to (desktop only). */
export type TerminalDock = 'right' | 'left' | 'bottom' | 'top';

export const TERMINAL_DOCKS: ReadonlyArray<{ id: TerminalDock; label: string }> = [
  { id: 'right', label: 'Derecha' },
  { id: 'left', label: 'Izquierda' },
  { id: 'bottom', label: 'Abajo' },
  { id: 'top', label: 'Arriba' },
];

/** Docked above or below the office: sized by height, tabs in a row. */
export const isVerticalDock = (dock: TerminalDock): boolean => dock === 'bottom' || dock === 'top';

const KEY = 'oficina.terminal';

function recall(): TerminalDock {
  try {
    const saved = localStorage.getItem(KEY);
    return TERMINAL_DOCKS.some((d) => d.id === saved) ? (saved as TerminalDock) : 'right';
  } catch {
    return 'right';
  }
}

/** Where the terminal goes, remembered in this browser. */
export function useTerminalDock(): [TerminalDock, (dock: TerminalDock) => void] {
  const [dock, setDockState] = useState<TerminalDock>(recall);
  const setDock = useCallback((next: TerminalDock) => {
    setDockState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* blocked storage: the choice just lasts this session */
    }
  }, []);
  return [dock, setDock];
}
