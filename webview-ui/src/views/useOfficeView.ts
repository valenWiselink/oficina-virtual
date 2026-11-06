import { useCallback, useState } from 'react';

export type OfficeView = 'tablero' | 'grafo' | 'control';

const VIEWS: readonly OfficeView[] = ['tablero', 'grafo', 'control'];

const KEY = 'oficina.vista';

function recall(): OfficeView {
  try {
    const saved = localStorage.getItem(KEY);
    return VIEWS.find((v) => v === saved) ?? 'tablero';
  } catch {
    return 'tablero';
  }
}

/** The view shown (board, live graph or Control), opening on the last one used. */
export function useOfficeView(): [OfficeView, (view: OfficeView) => void] {
  const [view, setViewState] = useState<OfficeView>(recall);
  const setView = useCallback((next: OfficeView) => {
    setViewState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* blocked storage: the choice just lasts this session */
    }
  }, []);
  return [view, setView];
}
