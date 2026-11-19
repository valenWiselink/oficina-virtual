import { useCallback, useState } from 'react';

export type OfficeView = 'nucleo' | 'tablero' | 'grafo' | 'control';

const VIEWS: readonly OfficeView[] = ['nucleo', 'tablero', 'grafo', 'control'];

const KEY = 'oficina.vista';
/** Set once the office opened on Núcleo after the update that brought it. */
const NUCLEO_SHOWN_KEY = 'oficina.nucleoPresentado';

/**
 * The view to open on: the last one used; Núcleo when none was, and once
 * after the update that brought it (chosen 2026-11-19), whatever was used
 * before — from then on, your choice again.
 */
export function recallView(storage: Pick<Storage, 'getItem' | 'setItem'>): OfficeView {
  const saved = storage.getItem(KEY);
  if (storage.getItem(NUCLEO_SHOWN_KEY) !== 'si') {
    storage.setItem(NUCLEO_SHOWN_KEY, 'si');
    storage.setItem(KEY, 'nucleo');
    return 'nucleo';
  }
  return VIEWS.find((v) => v === saved) ?? 'nucleo';
}

function recall(): OfficeView {
  try {
    return recallView(localStorage);
  } catch {
    return 'nucleo';
  }
}

/** The view shown (Núcleo, board, live graph or Asistente), opening on the last one used. */
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
