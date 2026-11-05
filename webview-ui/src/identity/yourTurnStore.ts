/**
 * Answers whose "te toca" the operator already handled ("Hecho"). Keyed by
 * the answer's record id, so the agent's next ask shows up again. Kept in
 * this browser across reloads; a blocked storage only makes it last the tab.
 */
const KEY = 'oficina.teTocaHecho';
const MAX_KEPT = 200;

let done: string[] = load();

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isYourTurnDone(turnId: string): boolean {
  return done.includes(turnId);
}

/** Everything this browser marked, for the office's list of pending asks. */
export function allYourTurnsDone(): readonly string[] {
  return done;
}

export function markYourTurnDone(turnId: string): void {
  if (done.includes(turnId)) return;
  done = [...done, turnId].slice(-MAX_KEPT);
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    /* blocked storage: it lasts this tab */
  }
}
