/**
 * When you last looked at each agent (its chat or terminal open on screen),
 * by its stable key (the session, not the number, which changes on every
 * start): an answer that came after that is unread. An agent the office has
 * never seen counts as looked at from the moment it first shows up, so what
 * finished before is not flagged. Kept in this browser across reloads; a
 * blocked storage only makes it last the tab.
 */
const KEY = 'oficina.visto';
/** Keys kept (the oldest looks are dropped first). */
const MAX_KEPT = 300;

let seen: Record<string, number> = load();

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, number] => typeof e[1] === 'number',
      ),
    );
  } catch {
    return {};
  }
}

function save(): void {
  const keys = Object.keys(seen);
  if (keys.length > MAX_KEPT) {
    const keep = keys.sort((a, b) => seen[b] - seen[a]).slice(0, MAX_KEPT);
    seen = Object.fromEntries(keep.map((k) => [k, seen[k]]));
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* blocked storage: it lasts this tab */
  }
}

export function seenAt(key: string): number | undefined {
  return seen[key];
}

/** Record a look at these agents (never moving one back in time). Returns
 *  true when anything changed. */
export function markSeen(looks: ReadonlyArray<{ key: string; at: number }>): boolean {
  let changed = false;
  for (const { key, at } of looks) {
    if ((seen[key] ?? -Infinity) >= at) continue;
    seen = { ...seen, [key]: at };
    changed = true;
  }
  if (changed) save();
  return changed;
}

/** First sight of agents the office never saw: looked at from now. */
export function noteFirstSight(keys: readonly string[], now: number): void {
  const fresh = keys.filter((k) => seen[k] === undefined);
  if (fresh.length > 0) markSeen(fresh.map((key) => ({ key, at: now })));
}
