import { useSyncExternalStore } from 'react';

/** One version's notes (HTML or markdown; releaseNotesText.ts reads them). */
export interface ReleaseNote {
  version: string;
  note: string;
}

/** The desktop app's updater as it reports itself (desktop/updates.ts
 *  UpdateState — keep both in step). */
export interface UpdateState {
  enabled: boolean;
  current: string;
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error';
  version?: string;
  notes: ReleaseNote[];
  whenIdle: boolean;
  lastCheck?: { at: number; outcome: 'none' | 'found' | 'error'; manual: boolean };
  whatsNew?: { version: string; notes: ReleaseNote[] };
}

/** What desktop/preload.ts exposes under oficinaDesktop.updates. */
export interface UpdatesBridge {
  state: () => Promise<UpdateState>;
  onChange: (listener: (state: UpdateState) => void) => () => void;
  check: () => Promise<UpdateState>;
  install: () => void;
  setWhenIdle: (on: boolean) => void;
  whatsNewSeen: () => void;
}

/** The updater, or undefined in a browser (and in a desktop app too old to
 *  have one): then no update notice exists at all. */
export function updatesBridge(): UpdatesBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { oficinaDesktop?: { updates?: UpdatesBridge } }).oficinaDesktop?.updates;
}

/** Whether this page runs inside the desktop app (the only place with an
 *  updater): Ajustes → Ayuda shows the version and the check only there. */
export function hasDesktopUpdates(): boolean {
  return updatesBridge() !== undefined;
}

let current: UpdateState | null = null;
const listeners = new Set<() => void>();
let started = false;

function publish(state: UpdateState): void {
  current = state;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const bridge = updatesBridge();
  if (!started && bridge) {
    started = true;
    bridge.onChange(publish);
    void bridge.state().then(publish);
  }
  return () => listeners.delete(listener);
}

/** The updater's state, live; null in a browser or before it answers. */
export function useDesktopUpdate(): UpdateState | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Ask now (Ajustes → Ayuda). The answer also reaches every listener. */
export async function checkForUpdatesNow(): Promise<UpdateState | null> {
  const bridge = updatesBridge();
  if (!bridge) return null;
  const state = await bridge.check();
  publish(state);
  return state;
}
