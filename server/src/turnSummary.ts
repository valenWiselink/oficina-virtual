/**
 * What an agent did in a turn, in a sentence or two, for the day's history:
 * the opening of its last answer (agents open with the outcome: "Publiqué la
 * 1.0.5 con…", "Encontré la causa…"), without the "Te toca" line, code or
 * markdown. Pure.
 */

/** Long enough for two short sentences or one long one. */
const SUMMARY_MAX = 240;
/** Stop adding sentences once this much is said. */
const SUMMARY_ENOUGH = 120;
/** A paragraph shorter than this ("## Listo") takes the next one along. */
const PARAGRAPH_ENOUGH = 25;
const SENTENCES_MAX = 2;

const plainLine = (line: string) =>
  line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images: their text
    .replace(/https?:\/\/\S+/g, '') // bare URLs say nothing here
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/, '') // headings, quotes, bullets
    .replace(/\*\*|`/g, '') // not __: names like mcp__oficina__ carry it
    .replace(/\s*\|\s*/g, ' ') // table cells
    .trim();

/** Lines read as one text: a line without closing punctuation (a heading, a
 *  bold label) ends its own sentence. */
const joinLines = (lines: readonly string[]) =>
  lines.reduce((text, line) => {
    if (!text) return line;
    return /[.!?…:;,]$/.test(text) ? `${text} ${line}` : `${text}. ${line}`;
  }, '');

export function turnSummary(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const paragraphs = text
    .replace(/```[\s\S]*?```/g, '\n\n')
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .filter((line) => !/^\s*te toca:/i.test(line) && !/^\s*\|?\s*:?-{3,}/.test(line))
        .map(plainLine)
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);
  const opening: string[] = [];
  for (const lines of paragraphs) {
    opening.push(...lines);
    if (joinLines(opening).length >= PARAGRAPH_ENOUGH) break;
  }
  const prose = joinLines(opening).replace(/\s+/g, ' ').trim();
  if (prose.length < 3) return undefined;
  let said = '';
  for (const sentence of prose.split(/(?<=[.!?…])\s+/).slice(0, SENTENCES_MAX)) {
    said = said ? `${said} ${sentence}` : sentence;
    if (said.length >= SUMMARY_ENOUGH) break;
  }
  said = said.replace(/[\s:;,]+$/, '');
  if (!/[.!?…]$/.test(said)) said += '.';
  return said.length > SUMMARY_MAX ? `${said.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : said;
}
