import { describe, expect, it } from 'vitest';

import { CHAT_FONT_MAX_PX, CHAT_FONT_MIN_PX, nextChatFont } from '../src/chat/chatFont.js';
import {
  CHAT_HINT,
  isLongAnswer,
  sameMessage,
  sameSent,
  shownPending,
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

  it('matches a message whose invisible characters the transcript dropped', () => {
    // Copied from Git Bash: U+0096 before «bash»; Claude Code recorded none.
    const sent =
      'Sebas@Seba-PC MINGW64 ~\n$ \u0096bash F:/proyectos/x/cortes.sh devwa\n' +
      "bash: $'\\302\\226bash': command not found";
    expect(sameMessage(sent, withChatHint(sent.replace('\u0096', '')))).toBe(true);
    expect(sameMessage('ho\u200bla', 'hola')).toBe(true);
  });

  it('folds long answers only', () => {
    expect(isLongAnswer('Listo, ya está en dev.')).toBe(false);
    expect(isLongAnswer(Array.from({ length: 20 }, (_, i) => `línea ${i}`).join('\n'))).toBe(true);
  });
});

describe('which sent messages the transcript shows', () => {
  const sent = (key: string, text: string, at: number, delivery: 'sending' | 'sent' = 'sent') => ({
    key,
    text,
    at,
    delivery,
  });

  it('by its text, wherever it is', () => {
    const shown = shownPending(
      [sent('p1', 'hola', 100), sent('p2', 'chau', 100)],
      [{ id: 'u1', text: withChatHint('chau'), at: 50 }],
    );
    expect([...shown.keys()]).toEqual(['p2']);
  });

  it('a delivered one recorded differently: the next line of yours after it, in order', () => {
    const shown = shownPending(
      [sent('p1', 'algo que Claude Code escribió distinto', 100), sent('p2', 'listo', 200)],
      [
        { id: 'u0', text: 'de antes', at: 50 },
        { id: 'u1', text: 'algo que Claude Code escribio distinto', at: 150 },
        { id: 'u2', text: withChatHint('listo'), at: 250 },
      ],
    );
    expect(shown.get('p1')?.id).toBe('u1');
    expect(shown.get('p2')?.id).toBe('u2');
  });

  it('not one still on its way, nor with a spoken line or one from before', () => {
    expect(
      shownPending([sent('p1', 'a', 100, 'sending')], [{ id: 'u1', text: 'b', at: 150 }]).size,
    ).toBe(0);
    expect(
      shownPending(
        [sent('p1', 'a', 100)],
        [
          { id: 'u0', text: 'b', at: 50 },
          { id: 'u1', text: 'Hola', at: 150, voice: true },
        ],
      ).size,
    ).toBe(0);
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
