import { describe, expect, it } from 'vitest';

import { CHAT_FONT_MAX_PX, CHAT_FONT_MIN_PX, nextChatFont } from '../src/chat/chatFont.js';
import {
  CHAT_HINT,
  isLongAnswer,
  sameMessage,
  sameSent,
  withChatHint,
  withoutChatHint,
} from '../src/chat/chatText.js';
import { parseMarkdown } from '../src/chat/markdownBlocks.js';
import { CHAT_FONT_SIZE_PX } from '../src/constants.js';

describe('chat font size', () => {
  it('steps by a pixel within 12–20 and resets with 0', () => {
    expect(nextChatFont(14, 1)).toBe(15);
    expect(nextChatFont(CHAT_FONT_MAX_PX, 1)).toBe(CHAT_FONT_MAX_PX);
    expect(nextChatFont(CHAT_FONT_MIN_PX, -1)).toBe(CHAT_FONT_MIN_PX);
    expect(nextChatFont(18, 0)).toBe(CHAT_FONT_SIZE_PX);
  });
});

describe('chat hint', () => {
  it('goes after a chat message and never shows in the bubble', () => {
    const sent = withChatHint('  ¿ya está en dev?  ');
    expect(sent).toBe(`¿ya está en dev?\n\n${CHAT_HINT}`);
    expect(withoutChatHint(sent)).toBe('¿ya está en dev?');
    expect(withoutChatHint('sin pista')).toBe('sin pista');
  });

  it('matches the transcript record with the sent message', () => {
    expect(sameMessage('hola\nqué tal', withChatHint('hola\r\nqué  tal'))).toBe(true);
    expect(sameMessage('hola', 'chau')).toBe(false);
    const long = 'Te voy a pasar feedback sobre la pantalla de métricas: '.repeat(3);
    expect(sameMessage(long, `${long.slice(0, 70)} [Pasted text #1 +3 lines]`)).toBe(true);
  });

  it('a message of only images is the hint alone', () => {
    expect(withChatHint('  ')).toBe(CHAT_HINT);
  });

  it('matches a message with images only with a line that has them', () => {
    const pics = ['blob:1'];
    expect(sameSent({ text: 'mirá', images: pics }, { text: 'mirá', images: 1 })).toBe(true);
    expect(sameSent({ text: 'mirá', images: pics }, { text: 'mirá' })).toBe(false);
    expect(sameSent({ text: '', images: pics }, { text: CHAT_HINT, images: 1 })).toBe(true);
    expect(sameSent({ text: '', images: pics }, { text: 'otra cosa', images: 1 })).toBe(false);
    expect(sameSent({ text: 'hola' }, { text: withChatHint('hola') })).toBe(true);
  });

  it('folds long answers only', () => {
    expect(isLongAnswer('Listo, ya está en dev.')).toBe(false);
    expect(isLongAnswer(Array.from({ length: 20 }, (_, i) => `línea ${i}`).join('\n'))).toBe(true);
  });
});

describe('parseMarkdown', () => {
  it('tells paragraphs, headings, quotes, rules and the "Te toca" line apart', () => {
    const blocks = parseMarkdown(
      [
        '## Qué hice',
        'Arreglé el bug',
        'en el cobro.',
        '',
        '> una cita',
        '---',
        'Te toca: correr la migración',
        'en dev.',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Qué hice' },
      { kind: 'para', lines: ['Arreglé el bug', 'en el cobro.'] },
      { kind: 'quote', lines: ['una cita'] },
      { kind: 'rule' },
      { kind: 'yourTurn', text: 'correr la migración en dev.' },
    ]);
  });

  it('nests lists and keeps a list going over a blank line', () => {
    const [list] = parseMarkdown(
      ['- uno', '  - uno.a', '  - uno.b', '- dos', '  sigue dos', '', '- tres'].join('\n'),
    );
    expect(list).toEqual({
      kind: 'list',
      ordered: false,
      start: 1,
      items: [
        {
          text: 'uno',
          children: [
            {
              kind: 'list',
              ordered: false,
              start: 1,
              items: [
                { text: 'uno.a', children: [] },
                { text: 'uno.b', children: [] },
              ],
            },
          ],
        },
        { text: 'dos sigue dos', children: [] },
        { text: 'tres', children: [] },
      ],
    });
    expect(parseMarkdown('3. tercero\n4. cuarto')[0]).toMatchObject({ ordered: true, start: 3 });
  });

  it('reads code fences and tables', () => {
    expect(parseMarkdown('```sql\nSELECT 1;\n```\n| a | b |\n|---|---|\n| 1 | 2 |')).toEqual([
      { kind: 'code', lang: 'sql', text: 'SELECT 1;' },
      { kind: 'table', header: ['a', 'b'], rows: [['1', '2']] },
    ]);
  });
});
