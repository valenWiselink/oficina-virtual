import { transport } from '../transport/index.js';

/**
 * Tells the views that something they read may have changed. The agent views
 * are built from state that lives outside React (the office state the message
 * handler mutates, and the identity, turn, research and permission stores),
 * so they used to be rebuilt on a 250 ms timer — a full render of the app four
 * times a second with nothing happening (measured 5.4 commits/s at rest,
 * 2026-11-19). Now they are rebuilt when one of those sources can have moved:
 * a server message, the connection changing, a «Hecho», or the end of a
 * research streak. Bumps in the same task collapse into one.
 */
let version = 0;
let queued = false;
const listeners = new Set<() => void>();

export function bumpViews(): void {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    version++;
    for (const listener of listeners) listener();
  });
}

export function subscribeViews(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function viewsVersion(): number {
  return version;
}

transport.onMessage(() => bumpViews());
transport.onStateChange(() => bumpViews());
