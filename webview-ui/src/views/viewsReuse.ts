/**
 * Keeps what did not change. A rebuilt list of views is made of new objects
 * even when nothing moved, and every card, effect and memo below compares by
 * reference — so each rebuild re-rendered the whole board. Here a view equal
 * in value to the one before is replaced by that same object, and a list
 * equal in value by the previous array, so a message about one agent only
 * re-renders that agent.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => sameValue(item, other[i]));
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** `next` with every item equal to its previous self (same `id`) swapped for
 *  that previous object; `previous` itself when nothing changed at all. */
export function reuseUnchanged<T extends { id: number }>(previous: readonly T[], next: T[]): T[] {
  const before = new Map(previous.map((item) => [item.id, item]));
  let changed = previous.length !== next.length;
  const kept = next.map((item, i) => {
    const old = before.get(item.id);
    if (old && sameValue(old, item)) {
      if (previous[i] !== old) changed = true;
      return old;
    }
    changed = true;
    return item;
  });
  return changed ? kept : (previous as T[]);
}
