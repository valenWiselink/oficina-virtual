/**
 * A browser runs the microtasks queued by each listener of a real key press
 * before the next listener (the «microtask checkpoint» after a callback),
 * while an event a test dispatches runs every listener in one go. React
 * renders a state set in a capture handler in such a microtask, so a test
 * that types needs the browser's order: `deliverLikeABrowser` gives it.
 *
 * Import it before React: react-dom keeps the queueMicrotask it finds when
 * it loads.
 */
let held: Array<() => void> | null = null;
const queue = globalThis.queueMicrotask.bind(globalThis);

globalThis.queueMicrotask = (task: () => void) => {
  if (held) held.push(task);
  else queue(task);
};

function runHeld(): void {
  while (held?.length) held.shift()?.();
}

/**
 * Dispatches `event` on `target` with the microtasks of the capture listeners
 * (React's, on its root) run before the target's and the bubbling ones.
 */
export function deliverLikeABrowser(target: EventTarget, event: Event): void {
  held = [];
  target.addEventListener(event.type, runHeld);
  try {
    target.dispatchEvent(event);
    runHeld();
  } finally {
    target.removeEventListener(event.type, runHeld);
    held = null;
  }
}
