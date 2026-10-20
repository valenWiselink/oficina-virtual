/**
 * The conversation as a chat: what you wrote, what the agent answered, and a
 * one-line note per tool it used — read from the session's own transcript
 * (so the chat shows exactly what was said, never a summary of it).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ChatItem } from '../../core/src/messages.js';

/** How much of a long transcript the chat loads at first (its latest part). */
const TAIL_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 300;
const TOOL_TEXT_MAX = 90;

type Rec = Record<string, unknown>;

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');

/** One line in plain Spanish for a tool call. */
export function toolLine(name: string, input: Rec): string | null {
  switch (name) {
    case 'Read':
      return `Leyó ${base(input.file_path)}`;
    case 'Edit':
    case 'MultiEdit':
      return `Editó ${base(input.file_path)}`;
    case 'Write':
      return `Escribió ${base(input.file_path)}`;
    case 'NotebookEdit':
      return `Editó ${base(input.notebook_path)}`;
    case 'Bash':
    case 'PowerShell':
      return `Corrió ${clip(String(input.command ?? '').split('\n')[0], TOOL_TEXT_MAX)}`;
    case 'Grep':
      return `Buscó «${clip(String(input.pattern ?? ''), 40)}»`;
    case 'Glob':
      return `Buscó archivos ${clip(String(input.pattern ?? ''), 40)}`;
    case 'WebFetch':
    case 'WebSearch':
      return 'Buscó en la web';
    case 'Agent':
    case 'Task':
      return `Lanzó un subagente: ${clip(String(input.description ?? ''), 60)}`;
    case 'Workflow':
      return 'Armó una junta de agentes';
    case 'AskUserQuestion':
      return 'Te hizo una pregunta con opciones';
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TodoWrite':
      return null; // the task list is shown elsewhere
    default:
      return `Usó ${name}`;
  }
}

/** What you typed, from a user record's text (null for what is not yours). */
function userText(raw: string): string | null {
  const text = raw.trim();
  const bash = text.match(/^<bash-input>([\s\S]*?)<\/bash-input>/);
  if (bash) return `! ${bash[1].trim()}`;
  const command = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (command) {
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
    return args ? `${command[1].trim()} ${args}` : command[1].trim();
  }
  // Harness output and notes (command stdout, reminders, caveats) are not yours.
  if (!text || text.startsWith('<') || text.startsWith('Caveat:')) return null;
  return text;
}

function atOf(record: Rec): number | undefined {
  const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
  return Number.isNaN(at) ? undefined : at;
}

/** The chat lines one transcript record contributes (often none). */
export function chatItemsOf(record: Rec): ChatItem[] {
  if (record.isSidechain === true || record.isMeta === true) return [];
  const id = typeof record.uuid === 'string' ? record.uuid : undefined;
  if (!id) return [];
  const at = atOf(record);
  const content = (record.message as { content?: unknown } | undefined)?.content;

  if (record.type === 'user') {
    const parts =
      typeof content === 'string'
        ? [content]
        : Array.isArray(content)
          ? (content as Rec[]).flatMap((b) =>
              b.type === 'text' && typeof b.text === 'string'
                ? [b.text]
                : b.type === 'image'
                  ? ['[imagen]']
                  : [],
            )
          : [];
    const text = parts.map(userText).filter(Boolean).join('\n\n');
    return text ? [{ id, role: 'user', text, at }] : [];
  }

  if (record.type !== 'assistant' || !Array.isArray(content)) return [];
  const items: ChatItem[] = [];
  (content as Rec[]).forEach((block, i) => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      items.push({ id: `${id}:${i}`, role: 'assistant', text: block.text.trim(), at });
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      const line = toolLine(block.name, (block.input ?? {}) as Rec);
      if (line) items.push({ id: `${id}:${i}`, role: 'tool', text: line, at });
    }
  });
  return items;
}

/** The latest part of a session's conversation, as chat lines. */
export function readChat(file: string): ChatItem[] {
  let text: string;
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    try {
      const length = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, size - length);
      text = buf.toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
  const items: ChatItem[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue; // also a line cut by the tail window
    try {
      items.push(...chatItemsOf(JSON.parse(line) as Rec));
    } catch {
      /* partial line */
    }
  }
  return items.slice(-MAX_ITEMS);
}
