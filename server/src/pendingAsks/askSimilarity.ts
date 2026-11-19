/**
 * Whether two asks say the same thing in other words: Jarvis rewords a
 * «Te toca» («Mergear wiselink-pases #4 antes del próximo pase» and later
 * «Mergear wiselink-pases #4 hoy antes de las 18»), or hands it to an agent in
 * a task worded his own way. Exact text, the same key and a shared PR, ticket
 * or artifact are already caught (refs.ts); this is for the rest, and it is
 * deliberately strict: joining two different asks hides one of them, which is
 * worse than leaving a duplicate for Jarvis to close.
 */

/** Words that say nothing about what is asked. */
const FILLER = new Set([
  'para',
  'antes',
  'después',
  'despues',
  'desde',
  'hasta',
  'sobre',
  'entre',
  'como',
  'cuando',
  'donde',
  'porque',
  'pero',
  'este',
  'esta',
  'estos',
  'estas',
  'esto',
  'todo',
  'todos',
  'toda',
  'todas',
  'hacer',
  'hace',
  'hoy',
  'mañana',
  'manana',
  'ahora',
  'próximo',
  'proximo',
  'próxima',
  'proxima',
  'mirar',
  'revisar',
  'pasar',
  'pasame',
  'decime',
  'decirme',
  'avisame',
  'avisar',
  'favor',
  'señor',
  'senor',
  'valentín',
  'valentin',
]);

/** The words that carry meaning: lowercased, without accents or punctuation,
 *  four letters or more (numbers and ids like «#843» or «6348» always count). */
export function contentWords(text: string): Set<string> {
  const words = text
    // A link says what it is about through its refs (refs.ts), not its words.
    .replace(/https?:\/\/\S+/gi, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9#._-]+/)
    .map((w) => w.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((w) => w && (/\d/.test(w) || w.length >= 4) && !FILLER.has(w))
    .map(stem);
  return new Set(words);
}

/** Just enough to match «instalar» with «instalá» and «pendiente» with
 *  «pendientes» (accents are already gone): an infinitive's «r» and a
 *  plural «s» on longer words. */
function stem(word: string): string {
  if (/\d/.test(word) || word.length <= 4) return word;
  if (/[aei]r$/.test(word)) return word.slice(0, -1);
  if (/[aeiou]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Share of the words two texts have in common (Jaccard), 0 to 1. */
export function overlap(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/** At least three meaningful words in common and most of them shared. */
export const SAME_ASK_OVERLAP = 0.6;
const MIN_SHARED = 3;

export function sameAsk(a: string, b: string): boolean {
  const wa = contentWords(a);
  const wb = contentWords(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  if (shared < MIN_SHARED) return false;
  return shared / (wa.size + wb.size - shared) >= SAME_ASK_OVERLAP;
}

/** A task handed to an agent covers an ask: every meaningful word of the ask
 *  (at least three) appears in the task, which is usually longer. */
export function taskCovers(task: string, ask: string): boolean {
  const words = contentWords(ask);
  if (words.size < MIN_SHARED) return false;
  const inTask = contentWords(task);
  let found = 0;
  for (const w of words) if (inTask.has(w)) found++;
  return found / words.size >= 0.8;
}
