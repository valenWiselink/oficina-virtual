import { useSyncExternalStore } from 'react';

/**
 * Where you dragged each agent on the graph, by its session (ids change when
 * the office restarts, and two agents can share a name). Remembered in this
 * browser; "Ordenar solo" forgets them all.
 */
const KEY = 'oficina.posiciones';
export interface Pin {
  x: number;
  y: number;
}

let pins: Record<string, Pin> = load();
const listeners = new Set<() => void>();

function load(): Record<string, Pin> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Pin>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

export function pinOf(name: string): Pin | undefined {
  return pins[name];
}

export function setPin(name: string, pin: Pin): void {
  pins = { ...pins, [name]: { x: Math.round(pin.x), y: Math.round(pin.y) } };
  save();
}

export function clearPins(): void {
  pins = {};
  save();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether any agent has a place you chose (for the "Ordenar solo" button). */
export function useHasPins(): boolean {
  return useSyncExternalStore(subscribe, () => Object.keys(pins).length > 0);
}
