import { describe, expect, it } from 'vitest';

import { markPromptLines } from '../src/terminal/promptLines.js';

describe('markPromptLines', () => {
  it('marks a sent message and the lines Claude Code wrapped it into', () => {
    const marks = markPromptLines([
      '* Sautéed for 2m 44s',
      '',
      '❯ cuando tenga imagen la notificacion va a aparecer en lugar',
      '  de la campana?',
      '',
      '● Bash(git fetch -q origin develop)',
      '  ⎿  13:  Title  string',
    ]);
    expect(marks).toEqual([false, false, true, true, false, false, false]);
  });

  it('keeps a message with paragraphs whole, up to Claude answering', () => {
    const marks = markPromptLines([
      '❯ App Review Guideline Issue',
      '',
      '  This is an automated message.',
      '',
      '  - Reply to this message',
      '',
      '● Bash(git fetch)',
    ]);
    expect(marks).toEqual([true, true, true, true, true, false, false]);
  });

  it('does not take the gap after a one-line message', () => {
    expect(markPromptLines(['❯ dale', '', '', '● Listo'])).toEqual([true, false, false, false]);
  });

  it('stops at the output hanging under a slash command', () => {
    expect(markPromptLines(['❯ /model', '  ⎿  Set model to Opus'])).toEqual([true, false]);
  });

  it('accepts the older ">" prompt', () => {
    expect(markPromptLines(['> hacé el PR'])).toEqual([true]);
  });

  it('skips the live input box and a menu cursor', () => {
    const marks = markPromptLines([
      '──────────',
      '❯ escribiendo',
      '──────────',
      '❯ 1. Yes',
      '  2. No',
    ]);
    expect(marks).toEqual([false, false, false, false, false]);
  });

  it('skips an empty prompt and Claude output', () => {
    expect(markPromptLines(['❯ ', '  texto de Claude', '● listo'])).toEqual([false, false, false]);
  });

  it('resumes a message that started above the scanned part', () => {
    const marks = markPromptLines(['  sigue el mensaje', '', '● respuesta'], {
      text: '❯ primera línea',
      marked: true,
    });
    expect(marks).toEqual([true, false, false]);
  });
});
