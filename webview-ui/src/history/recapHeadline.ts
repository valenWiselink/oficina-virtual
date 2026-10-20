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

/** Work still going on ("Estamos analizando…"), told as such. */
const ONGOING = /^(?:estamos|estoy|seguimos|sigo|vamos|voy)\s/i;
/** Words that say something got done (whole words: \b does not see accents). */
const DONE =
  /(?<!\p{L})(?:ya\s+(?:est[aá]n?|qued[oó]|quedaron|anda|andan|funciona|tengo|tenemos)|qued[oó]|quedaron|list[oa]s?|mergead[oa]s?|publiqu[eé]|publicad[oa]s?|arregl\p{L}*|termin\p{L}*|subid[oa]s?|abr[ií]|hice|arm[eé]|dej[eé]|aplicamos|aplicad[oa]s?)(?!\p{L})/iu;

/**
 * A headline as one thing you achieved today: none for work still going on
 * with nothing done yet, nor for a report on other agents («Nombre» …,
 * "Superviso…"); the PR or ticket number in parentheses goes (the list is
 * about what, not which).
 */
export function achievement(headline: string): string | undefined {
  // A report on other agents (a supervisor's): their own recaps tell it.
  if (headline.startsWith('«') || /^superviso\s/i.test(headline)) return undefined;
  if (ONGOING.test(headline) && !DONE.test(headline)) return undefined;
  return headline.replace(/\s*\((?:PR\s*)?#\d+\)/g, '').trim();
}
