/**
 * An agent's answer split into Markdown blocks: paragraphs, headings,
 * quotes, lists (nested), code, tables, rules and the "Te toca:" line.
 * Pure, so it is tested without a DOM; Markdown.tsx draws the blocks as
 * React elements (never as HTML).
 */

export interface ListItem {
  text: string;
  /** Lists nested under it. */
  children: MdBlock[];
}

export type MdBlock =
  | { kind: 'para'; lines: string[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'yourTurn'; text: string }
  | { kind: 'rule' };

const FENCE = /^\s*```(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;
const YOUR_TURN = /^\s*Te toca:\s*(.*)$/i;

const indentOf = (line: string) => line.match(/^\s*/)?.[0].replace(/\t/g, '  ').length ?? 0;
const blank = (line: string) => line.trim() === '';

/** A line that starts a block of its own (it ends a paragraph). */
function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    TABLE_ROW.test(line) ||
    YOUR_TURN.test(line)
  );
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or past the end)
      blocks.push({ kind: 'code', lang: fence[1].trim(), text: body.join('\n') });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    const turn = line.match(YOUR_TURN);
    if (turn) {
      const parts = [turn[1]];
      i++;
      while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i])) {
        parts.push(lines[i++].trim());
      }
      blocks.push({ kind: 'yourTurn', text: parts.join(' ').trim() });
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].match(QUOTE)![1]);
      blocks.push({ kind: 'quote', lines: quoted });
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        if (!TABLE_RULE.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', header: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const [list, next] = parseList(lines, i, indentOf(line));
      blocks.push(list);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !blank(lines[i]) && (para.length === 0 || !startsBlock(lines[i]))) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: 'para', lines: para });
  }
  return blocks;
}

/** A list from line `from`, whose items sit at `indent`; returns it and the
 *  line after it. Deeper items nest; deeper plain lines continue an item. */
function parseList(lines: string[], from: number, indent: number): [MdBlock, number] {
  const first = lines[from].match(LIST_ITEM)!;
  const ordered = /\d/.test(first[2]);
  const list: MdBlock & { kind: 'list' } = {
    kind: 'list',
    ordered,
    start: ordered ? parseInt(first[2], 10) : 1,
    items: [],
  };
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      // A blank line inside a list: it goes on if a deeper or sibling item follows.
      let j = i + 1;
      while (j < lines.length && blank(lines[j])) j++;
      const next = lines[j];
      if (next !== undefined && LIST_ITEM.test(next) && indentOf(next) >= indent) {
        i = j;
        continue;
      }
      break;
    }
    const item = line.match(LIST_ITEM);
    const depth = indentOf(line);
    if (item && depth === indent) {
      list.items.push({ text: item[3], children: [] });
      i++;
    } else if (item && depth > indent && list.items.length > 0) {
      const [nested, next] = parseList(lines, i, depth);
      list.items[list.items.length - 1].children.push(nested);
      i = next;
    } else if (!item && depth > indent && list.items.length > 0) {
      const last = list.items[list.items.length - 1];
      last.text = `${last.text} ${line.trim()}`;
      i++;
    } else {
      break;
    }
  }
  return [list, i];
}
