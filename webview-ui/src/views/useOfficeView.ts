import { useCallback, useState } from 'react';

export type OfficeView = 'tablero' | 'grafo';

const KEY = 'oficina.vista';

function recall(): OfficeView {
  try {
    return localStorage.getItem(KEY) === 'grafo' ? 'grafo' : 'tablero';
  } catch {
    return 'tablero';
  }
}

/** The view shown (board or live graph), opening on the last one used. */
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
