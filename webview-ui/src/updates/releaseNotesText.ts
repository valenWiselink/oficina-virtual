/**
 * Release notes as plain lines. GitHub's feed hands them over as HTML; a
 * generic feed may carry markdown. Either way the page shows text — never the
 * raw HTML — so tags go, entities are decoded, and lists become "• " lines.
 */

/** Where every version's notes live, for "Ver las novedades". */
const RELEASES_URL = 'https://github.com/valenWiselink/oficina-virtual/releases';

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rarr: '→',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
    const n =
      code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

/** One markdown line, readable: bullets as "• ", no heading marks, no
 *  emphasis or code ticks, links as their text. */
function plainMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}

/** The note as the lines to show, empty ones dropped. */
export function noteLines(note: string): string[] {
  const text = note
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|li|h[1-6]|ul|ol|div|blockquote|pre|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .split(/\r?\n/)
    .map((line) => plainMarkdown(line.trim()).replace(/^•\s+•\s+/, '• '))
    .filter((line) => line.length > 0);
}
