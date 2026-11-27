import { describe, expect, it } from 'vitest';

import { supervisorFor } from '../src/supervisors/supervisorMcp.js';

/** A registry where the supervisor of «tok» shows after `showsAfter` polls. */
function registry(showsAfter: number | null) {
  let polls = 0;
  const refused: string[] = [];
  return {
    refused,
    sessionOfToken: (t?: string) => (t === 'tok' ? 'sesion-jarvis' : undefined),
    supervisorByToken: (t?: string) => {
      if (t !== 'tok') return undefined;
      polls++;
      return showsAfter !== null && polls > showsAfter ? 7 : undefined;
    },
    noteMcpRefused: (s: string) => void refused.push(s),
  };
}

// Only the registry methods supervisorFor touches.
type Deps = Parameters<typeof supervisorFor>[0];
const deps = (r: ReturnType<typeof registry>, revived: string[]): Deps =>
  ({ registry: r, reviveSupervisor: (s: string) => void revived.push(s) }) as unknown as Deps;

describe('MCP: a known token whose supervisor is not live yet (27/11)', () => {
  it('answers at once for a live supervisor', async () => {
    const revived: string[] = [];
    expect(await supervisorFor(deps(registry(0), revived), 'tok', 2_000)).toBe(7);
    expect(revived).toEqual([]);
  });

  it('asks the office to bring it in and waits for it instead of a 401', async () => {
    const revived: string[] = [];
    const r = registry(3);
    expect(await supervisorFor(deps(r, revived), 'tok', 5_000)).toBe(7);
    expect(revived).toEqual(['sesion-jarvis']);
    expect(r.refused).toEqual([]);
  });

  it('refuses after the wait and notes it, so the office relaunches it when it shows', async () => {
    const revived: string[] = [];
    const r = registry(null);
    expect(await supervisorFor(deps(r, revived), 'tok', 600)).toBeUndefined();
    expect(r.refused).toEqual(['sesion-jarvis']);
  });

  it('refuses a token the office never handed out right away', async () => {
    const revived: string[] = [];
    const r = registry(null);
    const started = Date.now();
    expect(await supervisorFor(deps(r, revived), 'otro', 5_000)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(500);
    expect(revived).toEqual([]);
    expect(r.refused).toEqual([]);
  });
});
