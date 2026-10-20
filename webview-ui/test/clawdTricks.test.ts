import { describe, expect, it } from 'vitest';

import {
  activityProp,
  arrivalMotion,
  burstHop,
  COFFEE_AFTER_MS,
  isBuildOrTest,
  recentClicks,
  TRICK_WINDOW_MS,
  trickMotion,
  TRICKS,
} from '../src/views/clawdTricks.js';

describe('isBuildOrTest', () => {
  it('reads builds and tests from what the status line runs', () => {
    expect(isBuildOrTest('Corriendo: npm test')).toBe(true);
    expect(isBuildOrTest('Corriendo: npx vitest run test/foo.test.ts')).toBe(true);
    expect(isBuildOrTest('Corriendo: go test ./...')).toBe(true);
    expect(isBuildOrTest('Esperando: flutter build apk')).toBe(true);
    expect(isBuildOrTest('Corriendo: git status')).toBe(false);
    // Only commands: a task title that mentions tests is not running them.
    expect(isBuildOrTest('Escribiendo los tests del login')).toBe(false);
    expect(isBuildOrTest('Editando src/latest.ts')).toBe(false);
  });
});

describe('activityProp', () => {
  it('glasses to research, a wrench for builds, coffee after half an hour', () => {
    expect(activityProp({ kind: 'research', statusText: 'Investigando' }, 0)).toBe('glasses');
    expect(activityProp({ kind: 'work', statusText: 'Corriendo: npm run build' }, 0)).toBe(
      'wrench',
    );
    expect(activityProp({ kind: 'work', statusText: 'Editando a.ts' }, COFFEE_AFTER_MS)).toBe(
      'coffee',
    );
    expect(activityProp({ kind: 'work', statusText: 'Editando a.ts' }, 60_000)).toBeUndefined();
    expect(
      activityProp({ kind: 'idle', statusText: 'Sin tarea' }, COFFEE_AFTER_MS),
    ).toBeUndefined();
  });
});

describe('recentClicks', () => {
  it('keeps only the clicks inside the window', () => {
    expect(recentClicks([0, 500, 1000], 1500)).toEqual([0, 500, 1000, 1500]);
    expect(recentClicks([0, 500], TRICK_WINDOW_MS + 100)).toEqual([500, TRICK_WINDOW_MS + 100]);
  });
});

describe('motions', () => {
  it('every trick starts and ends at rest', () => {
    for (const t of TRICKS) {
      const end = trickMotion(t, 1);
      expect(Math.abs(end.lift ?? 0)).toBeLessThan(0.01);
      expect(Math.abs(end.shiftX ?? 0)).toBeLessThan(0.01);
      expect(Math.abs(((end.rotate ?? 0) % (Math.PI * 2)) % (Math.PI * 2))).toBeLessThan(0.01);
    }
  });

  it('a celebration bounces and settles; an arrival grows to full size', () => {
    expect(burstHop(1 / 6)).toBeGreaterThan(5);
    expect(burstHop(1)).toBeCloseTo(0);
    expect(arrivalMotion(0).scaleK).toBeCloseTo(0.25);
    expect(arrivalMotion(1).scaleK).toBeCloseTo(1);
    expect(Math.max(...[0.6, 0.7, 0.8].map((p) => arrivalMotion(p).scaleK))).toBeGreaterThan(1);
  });
});
