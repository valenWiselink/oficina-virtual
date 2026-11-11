/* eslint-disable pixel-agents/no-inline-colors -- PR numbers like «#2954» read as hex colours */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AskResolutionsList } from '../../core/src/messages.js';
import { PendingAsks } from '../src/pendingAsks/pendingAsks.js';
import { AskResolutions, UNDO_MS } from '../src/pendingAsks/resolutions.js';

const NOW = new Date(2026, 10, 11, 15, 45).getTime();
const WEB = 'https://github.com/acme/web/pull/2954';

let dir: string;
let clock: number;
let told: string[];
let shown: AskResolutionsList[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-res-'));
  clock = NOW;
  told = [];
  shown = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function office() {
  const asks = new PendingAsks({
    broadcast: () => undefined,
    file: path.join(dir, 'pendientes.json'),
    now: () => clock,
  });
  const resolutions = new AskResolutions({
    asks: () => asks,
    broadcast: (m) => shown.push(m),
    tellJarvis: (t) => told.push(t),
    now: () => clock,
    schedule: () => undefined,
    meetings: () => [
      { id: 'd', title: 'Demo AgroActiva', start: NOW + 18 * 3_600_000, end: NOW + 19 * 3_600_000 },
    ],
  });
  asks.add({
    from: 'Jarvis',
    text: `mergear ${WEB} a main`,
    command: `gh pr merge ${WEB} --merge`,
  });
  asks.add({
    from: 'Jarvis',
    text: '¿Páginas públicas en eventos.wiselink.app?',
    options: ['Sí', 'No'],
  });
  asks.add({ from: 'Jarvis', text: 'volver a marcar AgroActiva como demo' });
  asks.add({ from: 'reglas', text: 'confirmar si se borran las copias' });
  return { asks, resolutions };
}

describe('several asks settled from one sentence', () => {
  it('shows how each was taken, and applies it only after «Deshacer» had its time', () => {
    const { asks, resolutions } = office();
    const { taken, refused } = resolutions.propose([
      { id: 'p2', como: 'respuesta', respuesta: 'Sí' },
      { id: 'p3', como: 'posponer', cuando: 'después de: Demo AgroActiva' },
      { id: 'p4', como: 'hecho' },
    ]);
    expect(refused).toEqual([]);
    expect(taken).toHaveLength(3);
    expect(shown.at(-1)?.items.map((i) => i.label)).toEqual([
      '«Sí»',
      'Posponer a después de Demo AgroActiva',
      'Hecho',
    ]);
    // Nothing applied yet.
    expect(asks.find('p2')?.answeredAt).toBeUndefined();
    clock += UNDO_MS;
    resolutions.tick();
    expect(asks.find('p2')?.answeredHow).toContain('«Sí»');
    expect(asks.find('p3')?.notBefore).toBe(NOW + 19 * 3_600_000);
    expect(asks.find('p4')?.closedHow).toBe('Lo diste por hecho hablando');
    expect(shown.at(-1)?.items).toEqual([]);
  });

  it('«Deshacer» leaves it as it was, and Jarvis hears it', () => {
    const { asks, resolutions } = office();
    resolutions.propose([{ id: 'p4', como: 'hecho' }]);
    const key = shown.at(-1)?.items[0]?.key ?? '';
    resolutions.undo(key);
    clock += UNDO_MS;
    resolutions.tick();
    expect(asks.find('p4')?.closedAt).toBeUndefined();
    expect(told).toEqual([expect.stringContaining('Valentín deshizo «Hecho» en p4')]);
  });

  it('a merge is never applied by voice: it waits for the held button', () => {
    const { asks, resolutions } = office();
    resolutions.propose([{ id: 'p1', como: 'mergear' }]);
    const [item] = shown.at(-1)?.items ?? [];
    expect(item).toMatchObject({ label: 'Mergear #2954', hold: true });
    expect(item.applyAt).toBeUndefined();
    clock += UNDO_MS * 3;
    resolutions.tick();
    expect(asks.find('p1')?.closedAt).toBeUndefined();
    expect(shown.at(-1)?.items).toHaveLength(1);
    // Merged from its button: it leaves the tray.
    asks.merged('p1');
    resolutions.tick();
    expect(shown.at(-1)?.items).toEqual([]);
  });

  it('says what it could not take, and why', () => {
    const { resolutions } = office();
    const { refused } = resolutions.propose([
      { id: 'p9', como: 'hecho' },
      { id: 'p4', como: 'mergear' },
      { id: 'p3', como: 'posponer', cuando: 'cuando pueda' },
      { id: 'p2', como: 'respuesta' },
    ]);
    expect(refused).toEqual([
      'p9: no está abierto',
      'p4: no tiene un PR abierto para mergear',
      'p3: no entendí cuándo («cuando pueda»)',
      'p2: falta la respuesta',
    ]);
    expect(shown).toEqual([]);
  });

  it('a second reading of the same ask replaces the first', () => {
    const { resolutions } = office();
    resolutions.propose([{ id: 'p2', como: 'respuesta', respuesta: 'Sí' }]);
    resolutions.propose([{ id: 'p2', como: 'respuesta', respuesta: 'No' }]);
    expect(shown.at(-1)?.items.map((i) => i.label)).toEqual(['«No»']);
  });
});
