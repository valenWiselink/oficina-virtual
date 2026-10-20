/**
 * A session's headline for the day, from a Claude Code recap (the "※ recap"):
 * only what got done. A recap goes on to what is missing or next ("Falta…",
 * "Lo próximo es…", "Te queda…", "Cuando termine…"); that part is cut, along
 * with the "Te toca" line and the "(disable recaps in /config)" note. A recap that says nothing
 * happened yet ("sólo nos saludamos") gives no headline. Pure.
 */

const HEADLINE_MAX = 260;

/** A sentence or clause that asks for something instead of telling what was done. */
const ASKS =
  /^(?:(?:si querés|cuando (?:decidas|me digas|quieras|puedas)|después|ahora)[^,]*,\s*)?(?:te |me |nos )?(?:falta|el próximo paso|el siguiente paso|lo próximo|lo siguiente|lo que sigue|sigue |queda |toca |necesito que|pendiente|contame|avisame|decime)/i;

/** A plan for later ("Cuando termine el deploy, la pruebo…"): not done yet. */
const LATER = /^cuando\s/i;

const NOTHING_YET = /todavía no (?:arrancamos|empezamos|hicimos)|s[oó]lo nos saludamos/i;

export function recapHeadline(text: string): string | undefined {
  const prose = text
    .replace(/\(disable recaps[^)]*\)/gi, '')
    .split('\n')
    .filter((line) => !/^\s*te toca:/i.test(line))
    .join(' ')
    .replace(/\*\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!prose || NOTHING_YET.test(prose)) return undefined;
  const kept: string[] = [];
  for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
    const clauses = sentence.split(/;\s+/);
    const asking = clauses.findIndex((c) => ASKS.test(c.trim()) || LATER.test(c.trim()));
    if (asking === -1) {
      kept.push(sentence);
      continue;
    }
    if (asking > 0) kept.push(clauses.slice(0, asking).join('; '));
    break;
  }
  let headline = kept.join(' ').replace(/[\s,;:]+$/, '');
  if (!headline) return undefined;
  if (!/[.!?…]$/.test(headline)) headline += '.';
  return headline.length > HEADLINE_MAX
    ? `${headline.slice(0, HEADLINE_MAX - 1).trimEnd()}…`
    : headline;
}
