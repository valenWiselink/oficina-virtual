/* eslint-disable pixel-agents/no-inline-colors -- PR numbers like «#843» read as hex colours */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingAsksList } from '../../core/src/messages.js';
import { teTocaLine, teTocaReplaces } from '../src/agentIdentity.js';
import { contentWords, sameAsk, taskCovers } from '../src/pendingAsks/askSimilarity.js';
import {
  ANSWERED_HOW,
  JARVIS,
  LEFT_TO_JARVIS_HOW,
  PENDING_ASKS_BACKUP_SUFFIX,
  PendingAsks,
} from '../src/pendingAsks/pendingAsks.js';
import { openAsksContext } from '../src/pendingAsks/promptContext.js';
import { supervisorSettings } from '../src/supervisors/supervision.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

let dir: string;
let file: string;
let sent: PendingAsksList[];
let clock: number;

const list = () =>
  new PendingAsks({ broadcast: (m) => sent.push(m), tellJarvis: () => {}, file, now: () => clock });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-delegate-'));
  file = path.join(dir, 'pendientes.json');
  sent = [];
  clock = NOW;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the same ask in other words', () => {
  it('keeps the words that carry meaning, cut to their stem', () => {
    expect([...contentWords('Mergear wiselink-pases #4 antes del próximo pase')]).toEqual([
      'mergea',
      'wiselink-pase',
      '#4',
      'pase',
    ]);
    expect(contentWords('instalá').has('instala')).toBe(true);
    expect(contentWords('instalar').has('instala')).toBe(true);
  });

  it('joins a rewording and keeps different asks apart', () => {
    expect(
      sameAsk(
        'Mergear wiselink-pases #4 antes del próximo pase',
        'Mergear wiselink-pases #4 hoy antes de las 18',
      ),
    ).toBe(true);
    expect(
      sameAsk(
        'Mergear wiselink-pases #4 antes del próximo pase',
        'Instalar Wiselink 2.4.2 (107) desde TestFlight y probar el panel contra dev',
      ),
    ).toBe(false);
    expect(sameAsk('Revisar el PR', 'Revisar el PR')).toBe(false); // too few words to tell
  });

  it('a task covers an ask when it carries all its words', () => {
    expect(
      taskCovers(
        'Instalá Wiselink 2.4.2 (107) desde TestFlight en el simulador y probá el panel contra dev; avisame qué falla',
        'Instalar Wiselink 2.4.2 (107) desde TestFlight y probar el panel contra dev',
      ),
    ).toBe(true);
    expect(
      taskCovers('Arreglá el header del evento', 'Sumar crm #843, #844 y #845 al próximo pase'),
    ).toBe(false);
  });

  it('a reworded «Te toca» from the same author joins the open one', () => {
    const asks = list();
    const first = asks.add({
      from: JARVIS,
      text: 'Mergear wiselink-pases #4 antes del próximo pase',
    })!;
    const again = asks.add({
      from: JARVIS,
      text: 'Mergear wiselink-pases #4 hoy antes de las 18',
    })!;
    expect(again.id).toBe(first.id);
    expect(asks.pending()).toHaveLength(1);
    expect(asks.pending()[0].text).toBe('Mergear wiselink-pases #4 hoy antes de las 18');
    expect(asks.pending()[0].history?.[0]?.text).toBe(
      'Mergear wiselink-pases #4 antes del próximo pase',
    );
  });
});

describe('«Te toca [pN]: …»', () => {
  it('names the ask it rewords and keeps the text clean', () => {
    const reply = 'Ok, señor.\n\n**Te toca [p556]:** mergear wiselink-pases #4 hoy';
    expect(teTocaReplaces(reply)).toBe('p556');
    expect(teTocaLine(reply)).toBe('mergear wiselink-pases #4 hoy');
    expect(teTocaReplaces('Te toca: probar en dev')).toBeUndefined();
    expect(teTocaLine('Te toca: probar en dev')).toBe('probar en dev');
  });

  it('replaces that ask instead of adding one', () => {
    const asks = list();
    const old = asks.add({ from: JARVIS, text: 'Decidir la variante del repositorio de visitas' })!;
    const next = asks.add({
      from: JARVIS,
      text: 'Elegir A, B o C para visitas hoy',
      replaces: [old.id],
    })!;
    expect(next.id).toBe(old.id);
    expect(asks.pending()).toHaveLength(1);
  });
});

describe('handed to an agent', () => {
  it('by id: it leaves «Te toca» and the page learns who does it', () => {
    const asks = list();
    const ask = asks.add({ from: JARVIS, text: 'Sumar crm #843, #844 y #845 al próximo pase' })!;
    expect(asks.delegate('visitas', 'Sumalos al pase', [ask.id]).map((a) => a.id)).toEqual([
      ask.id,
    ]);
    expect(asks.message().open[0].delegatedTo).toEqual({ agent: 'visitas', at: NOW });
  });

  it('without an id: the asks the task covers, and only those', () => {
    const asks = list();
    const panel = asks.add({
      from: JARVIS,
      text: 'Instalar Wiselink 2.4.2 (107) desde TestFlight y probar el panel contra dev',
    })!;
    const other = asks.add({ from: JARVIS, text: 'Mirar los puntos de WISE-6348 y WISE-6385' })!;
    const moved = asks.delegate(
      'panel',
      'Instalá Wiselink 2.4.2 (107) desde TestFlight y probá el panel contra dev',
    );
    expect(moved.map((a) => a.id)).toEqual([panel.id]);
    expect(asks.pending().find((a) => a.id === other.id)?.delegatedTo).toBeUndefined();
  });

  it('a shared ticket or PR is enough', () => {
    const asks = list();
    const ask = asks.add({ from: JARVIS, text: 'Mirar si te cierran los puntos de WISE-6348' })!;
    expect(asks.delegate('tablero', 'Recalculá WISE-6348 con el criterio nuevo')[0]?.id).toBe(
      ask.id,
    );
  });

  it('comes back to «Te toca» when that agent closes, or with «Deshacer»', () => {
    const asks = list();
    const a = asks.add({ from: JARVIS, text: 'Sumar crm #843, #844 y #845 al próximo pase' })!;
    const b = asks.add({ from: JARVIS, text: 'Probar el panel del expositor contra dev' })!;
    asks.delegate('visitas', '', [a.id]);
    asks.delegate('panel', '', [b.id]);
    clock += 10 * MIN;
    expect(asks.undelegate('visitas').map((x) => x.id)).toEqual([a.id]);
    expect(asks.pending().find((x) => x.id === a.id)?.delegatedTo).toBeUndefined();
    expect(asks.takeBack(b.id)).toBe(true);
    expect(asks.pending().every((x) => x.delegatedTo === undefined)).toBe(true);
  });
});

describe('his answer without an id', () => {
  const two = (asks: PendingAsks) => {
    const first = asks.add({ from: JARVIS, text: 'Elegir la variante de visitas (A, B o C)' })!;
    clock += MIN;
    const last = asks.add({ from: JARVIS, text: 'Confirmar que pasamos el pase a mañana' })!;
    clock += MIN;
    return { first, last };
  };

  it('«nose» goes with the last «Te toca» and leaves it to Jarvis', () => {
    const asks = list();
    const { first, last } = two(asks);
    expect(asks.answeredBy('nose', clock, NOW - MIN).map((a) => a.id)).toEqual([last.id]);
    expect(asks.pending().find((a) => a.id === last.id)?.answeredHow).toBe(LEFT_TO_JARVIS_HOW);
    expect(asks.pending().find((a) => a.id === first.id)?.answeredAt).toBeUndefined();
  });

  it('«hacelo vos» hands it to Jarvis', () => {
    const asks = list();
    const { last } = two(asks);
    asks.answeredBy('hacelo vos', clock, NOW - MIN);
    expect(asks.pending().find((a) => a.id === last.id)?.delegatedTo?.agent).toBe(JARVIS);
  });

  it('«listo» with several open goes with the last one too', () => {
    const asks = list();
    const { first, last } = two(asks);
    expect(asks.answeredBy('listo', clock, NOW - MIN).map((a) => a.id)).toEqual([last.id]);
    expect(asks.pending().find((a) => a.id === last.id)?.answeredHow).toBe(
      `${ANSWERED_HOW}: «listo»`,
    );
    expect(asks.pending().find((a) => a.id === first.id)?.answeredAt).toBeUndefined();
  });

  it('«los dos» still answers all of them', () => {
    const asks = list();
    const { first, last } = two(asks);
    expect(
      asks
        .answeredBy('listo los dos', clock, NOW - MIN)
        .map((a) => a.id)
        .sort(),
    ).toEqual([first.id, last.id].sort());
  });

  it('an ask an agent is doing is not his to answer', () => {
    const asks = list();
    const { first, last } = two(asks);
    asks.delegate('visitas', '', [last.id]);
    expect(asks.answeredBy('dale', clock, NOW - MIN).map((a) => a.id)).toEqual([first.id]);
  });
});

describe('what Jarvis reads with every message', () => {
  it('lists the open ones with their ids, newest first, and who does each', () => {
    const asks = list();
    const old = asks.add({ from: JARVIS, text: 'Mirar los puntos de WISE-6348' })!;
    clock += 25 * MIN;
    const fresh = asks.add({ from: 'visitas', text: 'Sumar crm #843 al próximo pase' })!;
    asks.delegate('visitas', '', [fresh.id]);
    const text = openAsksContext(asks.pending(), clock + 5 * MIN);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^\[Oficina\] Pendientes abiertos de Valentín \(2\)/);
    expect(lines[0]).toContain('Te toca [pN]');
    expect(lines[1]).toBe(
      `- [${fresh.id}] Sumar crm #843 al próximo pase · de visitas · hace 5 min · lo hace «visitas»`,
    );
    expect(lines[2]).toBe(`- [${old.id}] Mirar los puntos de WISE-6348 · de Jarvis · hace 30 min`);
  });

  it('says so when there is nothing', () => {
    expect(openAsksContext([], NOW)).toBe('[Oficina] Valentín no tiene pendientes abiertos.');
  });
});

describe("a supervisor's own settings", () => {
  it('carry the Spanish and a UserPromptSubmit hook to the office', () => {
    const settings = supervisorSettings(true, { command: 'node "C:/x/claude-hook.js"' });
    expect(settings).toHaveProperty('spinnerVerbs');
    expect(settings.hooks).toEqual({
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: 'node "C:/x/claude-hook.js"', timeout: 5 }],
        },
      ],
    });
    expect(supervisorSettings(false, { command: 'x' })).not.toHaveProperty('spinnerVerbs');
  });
});

describe('the list kept before this version', () => {
  it('is copied once, and never overwritten', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, nextId: 2, asks: [], seen: [] }));
    list();
    const backup = file + PENDING_ASKS_BACKUP_SUFFIX;
    expect(JSON.parse(fs.readFileSync(backup, 'utf-8')).nextId).toBe(2);
    list().add({ from: JARVIS, text: 'Algo nuevo para hacer hoy' });
    list();
    expect(JSON.parse(fs.readFileSync(backup, 'utf-8')).nextId).toBe(2);
  });
});
