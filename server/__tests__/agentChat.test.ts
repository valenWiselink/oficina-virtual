import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { chatItemsOf, readChat, toolLine } from '../src/agentChat.js';

// Record shapes as Claude Code 2.1 writes them.
const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  uuid,
  timestamp: '2026-10-19T15:00:00.000Z',
  message: { role: 'user', content },
  ...extra,
});
const assistant = (uuid: string, content: unknown[]) => ({
  type: 'assistant',
  uuid,
  timestamp: '2026-10-19T15:00:05.000Z',
  message: { role: 'assistant', content },
});

describe('chatItemsOf', () => {
  it('keeps what you wrote, and what the agent answered, in order', () => {
    expect(chatItemsOf(user('u1', 'armá el endpoint'))).toEqual([
      {
        id: 'u1',
        role: 'user',
        text: 'armá el endpoint',
        at: Date.parse('2026-10-19T15:00:00.000Z'),
      },
    ]);
    const items = chatItemsOf(
      assistant('a1', [
        { type: 'text', text: 'Listo.' },
        { type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'F:\\x\\handler.go' } },
        { type: 'tool_use', id: 't2', name: 'TodoWrite', input: {} },
      ]),
    );
    expect(items.map((i) => [i.role, i.text])).toEqual([
      ['assistant', 'Listo.'],
      ['tool', 'Editó handler.go'],
    ]);
  });

  it('drops tool results, harness notes, meta and subagent lines', () => {
    expect(
      chatItemsOf(user('u2', [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }])),
    ).toEqual([]);
    expect(chatItemsOf(user('u3', '<local-command-stdout>x</local-command-stdout>'))).toEqual([]);
    expect(chatItemsOf(user('u4', 'hola', { isMeta: true }))).toEqual([]);
    expect(chatItemsOf(user('u5', 'hola', { isSidechain: true }))).toEqual([]);
  });

  it('shows your ! commands and slash commands as you typed them', () => {
    expect(chatItemsOf(user('u6', '<bash-input>npm test</bash-input>'))[0].text).toBe('! npm test');
    expect(
      chatItemsOf(
        user('u7', '<command-name>/rename</command-name><command-args>Pagos</command-args>'),
      )[0].text,
    ).toBe('/rename Pagos');
  });
});

describe('toolLine', () => {
  it('says each tool in a few words', () => {
    expect(toolLine('Bash', { command: 'go test ./...\necho' })).toBe('Corrió go test ./...');
    expect(toolLine('Grep', { pattern: 'PAYMENTS' })).toBe('Buscó «PAYMENTS»');
    expect(toolLine('Agent', { description: 'Revisar el PR' })).toBe(
      'Lanzó un subagente: Revisar el PR',
    );
  });
});

describe('readChat', () => {
  it('reads a transcript into chat lines, skipping broken lines', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
    try {
      const file = path.join(dir, 's.jsonl');
      fs.writeFileSync(
        file,
        [
          JSON.stringify(user('u1', 'hola')),
          '{"type":"us',
          JSON.stringify(assistant('a1', [{ type: 'text', text: 'Hola!' }])),
        ].join('\n'),
      );
      expect(readChat(file).map((i) => i.text)).toEqual(['hola', 'Hola!']);
      expect(readChat(path.join(dir, 'nada.jsonl'))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
