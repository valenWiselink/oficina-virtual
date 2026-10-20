import { describe, expect, it } from 'vitest';

import { emptyLine, greeting, officeSummary } from '../src/views/boardMood.js';

describe('greeting', () => {
  it('follows the hour', () => {
    expect(greeting(8).text).toBe('Buen día');
    expect(greeting(15).text).toBe('Buenas tardes');
    expect(greeting(23).text).toBe('Buenas noches');
    expect(greeting(2).text).toBe('Buenas noches');
  });
});

describe('officeSummary', () => {
  it('says who works, who finished and always the wait', () => {
    expect(officeSummary({ needs: 0, work: 2, done: 1, idle: 3 })).toBe(
      '2 trabajando · 1 terminó · nadie te espera',
    );
    expect(officeSummary({ needs: 2, work: 0, done: 0, idle: 1 })).toBe('2 te esperan');
  });

  it('invites to start when there is nobody', () => {
    expect(officeSummary({ needs: 0, work: 0, done: 0, idle: 0 })).toMatch(/vacía/);
  });
});

describe('emptyLine', () => {
  it('keeps the same line all day and changes the next', () => {
    expect(emptyLine('needs', 100)).toBe(emptyLine('needs', 100));
    expect(emptyLine('needs', 100)).not.toBe(emptyLine('needs', 101));
  });
});
