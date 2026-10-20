import { describe, expect, it } from 'vitest';

import {
  contextSummary,
  formatTokens,
  modelShortName,
  spendSummary,
  usageDetail,
} from '../src/views/usageText.js';

describe('modelShortName', () => {
  it('reads the family and version of current and older ids', () => {
    expect(modelShortName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelShortName('claude-opus-5-5[1m]')).toBe('Opus 5.5');
    expect(modelShortName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
    expect(modelShortName('claude-sonnet-4-20250514')).toBe('Sonnet 4');
    expect(modelShortName('claude-3-5-haiku-20241022')).toBe('Haiku 3.5');
    expect(modelShortName('claude-haiku-5-5')).toBe('Haiku 5.5');
  });

  it('leaves an id it cannot read as it is', () => {
    expect(modelShortName('42')).toBe('42');
  });
});

describe('formatTokens', () => {
  it('writes thousands and millions the Argentine way', () => {
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(4200)).toBe('4,2 k');
    expect(formatTokens(142_300)).toBe('142 k');
    expect(formatTokens(1_000_000)).toBe('1 M');
    expect(formatTokens(3_140_000)).toBe('3,1 M');
  });
});

describe('summaries', () => {
  it('says how full the context is', () => {
    expect(contextSummary(142_000, 1_000_000)).toBe('contexto 142 k de 1 M (14%)');
  });

  it('says what the session read (and how much from cache) and wrote', () => {
    const spend = { input: 2000, cacheRead: 2_900_000, cacheWrite: 200_000, output: 48_000 };
    expect(spendSummary(spend)).toBe('en la sesión: 3,1 M leídos (2,9 M de caché) y 48 k escritos');
  });

  it('joins what it knows into one line', () => {
    expect(
      usageDetail({
        model: 'claude-opus-5-5',
        contextTokens: 142_000,
        maxContextTokens: 1_000_000,
        spend: { input: 2000, cacheRead: 2_900_000, cacheWrite: 200_000, output: 48_000 },
      }),
    ).toBe(
      'Opus 5.5 · contexto 142 k de 1 M (14%) · en la sesión: 3,1 M leídos (2,9 M de caché) y 48 k escritos',
    );
    expect(usageDetail({ model: 'claude-haiku-5-5' })).toBe('Haiku 5.5');
  });
});
