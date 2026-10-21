import { describe, expect, it } from 'vitest';

import { HOOK_HEALTH_TITLE, hookHealthText } from '../src/components/hookHealthText.js';

const status = (over: Partial<Parameters<typeof hookHealthText>[0]> = {}) => ({
  type: 'hookHealth' as const,
  failing: true,
  failures: 12,
  timedOut: 12,
  ...over,
});

describe('hookHealthText', () => {
  it('says the hooks are slow, how many and how slow, and what to do', () => {
    const text = hookHealthText(status({ slowestMs: 40_600 }));
    expect(text.title).toBe(HOOK_HEALTH_TITLE);
    expect(text.line).toBe(
      'Los avisos de Claude tardan en llegar (12 en 10 min, hasta 41 s) y puede mostrar estados viejos. Reinstalalos; si sigue, cerrá los agentes que no uses.',
    );
  });

  it('says they fail when most of them errored, keeping the error for the tooltip', () => {
    const error = 'Oficina virtual.exe: bad option: --oficina-hook';
    const text = hookHealthText(status({ timedOut: 1, lastError: error }));
    expect(text.line).toMatch(/^12 avisos de Claude fallaron en 10 min/);
    expect(text.line).toMatch(/Reinstalalos/);
    expect(text.detail).toBe(error);
  });
});
