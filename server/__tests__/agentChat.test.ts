import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { chatItemsOf, readChat, toolLine, userItem } from '../src/agentChat.js';

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

describe('who wrote a line', () => {
  it('tells the office and a supervisor from you, and a spoken message from a typed one', () => {
    expect(userItem('1', '[Oficina] «Coral» terminó su turno.', 5)).toEqual({
      id: '1',
      role: 'note',
      from: 'Oficina',
      text: '«Coral» terminó su turno.',
      at: 5,
    });
    expect(userItem('2', '[Supervisor «Jarvis»] Seguí con el PR', 6)).toMatchObject({
      role: 'note',
      from: 'Jarvis',
      text: 'Seguí con el PR',
    });
    expect(userItem('3', '[Voz] ¿Cómo viene Coral?', 7)).toEqual({
      id: '3',
      role: 'user',
      voice: true,
      text: '¿Cómo viene Coral?',
      at: 7,
    });
    expect(userItem('4', 'Hola [Oficina]', 8)).toMatchObject({
      role: 'user',
      text: 'Hola [Oficina]',
    });
  });

  it('says the office tools and other MCP tools in words, never their raw id', () => {
    expect(toolLine('mcp__oficina__escribir_a_agente', { agente: 'Coral' })).toBe(
      'Le escribió a «Coral»',
    );
    expect(toolLine('mcp__oficina__lanzar_agente', { apodo: 'Pulpo' })).toBe('Abrió a «Pulpo»');
    expect(toolLine('mcp__oficina__pasar_resultado', { de: 'Coral', a: 'Pulpo' })).toBe(
      'Le pasó a «Pulpo» lo de «Coral»',
    );
    expect(toolLine('mcp__oficina__anotar', {})).toBe('Anotó en su bitácora');
    expect(toolLine('mcp__claude_ai_Atlassian__getJiraIssue', {})).toBe(
      'Usó getJiraIssue (Atlassian)',
    );
    expect(toolLine('ToolSearch', {})).toBeNull();
    expect(toolLine('SendMessage', { to: 'oficina-coral' })).toBe('Le escribió a «oficina-coral»');
  });
});

describe('what you sent while it was working', () => {
  const queued = (uuid: string, prompt: string) => ({
    type: 'attachment',
    uuid,
    timestamp: '2026-10-22T20:00:00.000Z',
    attachment: { type: 'queued_command', prompt },
  });

  it('is yours, though only an attachment records it', () => {
    expect(chatItemsOf(queued('q1', '[Voz] sí, dale'))).toEqual([
      {
        id: 'q1',
        role: 'user',
        voice: true,
        text: 'sí, dale',
        at: Date.parse('2026-10-22T20:00:00.000Z'),
      },
    ]);
  });

  it('but not a background report queued the same way', () => {
    expect(chatItemsOf(queued('q2', '<task-notification>\n<task-id>b1</task-id>'))).toEqual([]);
    expect(chatItemsOf({ type: 'attachment', uuid: 'q3', attachment: { type: 'other' } })).toEqual(
      [],
    );
  });
});

describe('images you sent', () => {
  const png = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBO' } };

  it('are counted, not left as Claude Code marks in the text', () => {
    const [item] = chatItemsOf(user('i1', [{ type: 'text', text: '[Image #1] ¿qué ves?' }, png]));
    expect(item).toMatchObject({ role: 'user', text: '¿qué ves?', images: 1 });
  });

  it('make a line of their own when there is no text', () => {
    const [item] = chatItemsOf(
      user('i2', [png, png, { type: 'text', text: '[Image #1] [Image #2]' }]),
    );
    expect(item).toMatchObject({ role: 'user', text: '', images: 2 });
  });

  it('are counted by their marks while the agent works (queued)', () => {
    const [item] = chatItemsOf({
      type: 'attachment',
      uuid: 'q4',
      attachment: { type: 'queued_command', prompt: '[Image #3] mirá esto' },
    });
    expect(item).toMatchObject({ role: 'user', text: 'mirá esto', images: 1 });
  });

  it('a message without images has no count', () => {
    expect(chatItemsOf(user('i3', 'hola'))[0]).not.toHaveProperty('images');
  });
});
