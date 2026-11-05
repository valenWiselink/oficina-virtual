import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { ArtifactEntry } from '../../core/src/messages.ts';
import {
  artifactAuthor,
  artifactWhen,
  filterArtifacts,
  readArtifactsMessage,
} from '../src/artifacts/artifactsView.ts';

const NOW = new Date(2026, 10, 5, 14, 0).getTime();
const MIN = 60_000;

function artifact(over: Partial<ArtifactEntry> = {}): ArtifactEntry {
  return { id: 'a', url: 'https://claude.ai/artifact/a', title: 'Plan', at: NOW, ...over };
}

describe('when', () => {
  it('near things by the clock', () => {
    assert.equal(artifactWhen(NOW - 10_000, NOW), 'recién');
    assert.equal(artifactWhen(NOW - 12 * MIN, NOW), 'hace 12 min');
    assert.equal(artifactWhen(NOW - 3 * 60 * MIN, NOW), 'hace 3 h');
  });

  it('yesterday is the calendar day, even a few hours ago', () => {
    const lateLastNight = new Date(2026, 10, 4, 23, 0).getTime();
    const earlyMorning = new Date(2026, 10, 5, 2, 0).getTime();
    assert.equal(artifactWhen(lateLastNight, earlyMorning), 'ayer');
  });

  it('the rest by the date; the year only when it is another', () => {
    const lastWeek = new Date(2026, 9, 12, 10, 0).getTime();
    assert.match(artifactWhen(lastWeek, NOW), /^12 oct$/);
    const lastYear = new Date(2025, 9, 12, 10, 0).getTime();
    assert.match(artifactWhen(lastYear, NOW), /2025/);
  });

  it('a clock slightly behind the publish still reads well', () => {
    assert.equal(artifactWhen(NOW + 5_000, NOW), 'recién');
  });
});

describe('author', () => {
  it('the agent, else its folder, else says it does not know', () => {
    assert.equal(artifactAuthor(artifact({ agent: 'Junta', folder: 'repo' })), 'Junta');
    assert.equal(artifactAuthor(artifact({ folder: 'repo' })), 'repo');
    assert.equal(artifactAuthor(artifact()), 'Agente desconocido');
  });
});

describe('search', () => {
  const rows = [
    artifact({ id: '1', title: 'Diseño del plano', agent: 'Junta' }),
    artifact({ id: '2', title: 'Métricas', agent: 'Reportes', folder: 'repo-datos' }),
    artifact({ id: '3', title: 'Plano 3D' }),
  ];
  const ids = (query: string) => filterArtifacts(rows, query).map((r) => r.id);

  it('an empty search shows everything', () => {
    assert.deepEqual(ids('  '), ['1', '2', '3']);
  });

  it('ignores case and accents', () => {
    assert.deepEqual(ids('DISENO'), ['1']);
    assert.deepEqual(ids('metricas'), ['2']);
  });

  it('looks in the title, the agent and the folder', () => {
    assert.deepEqual(ids('plano'), ['1', '3']);
    assert.deepEqual(ids('junta'), ['1']);
    assert.deepEqual(ids('datos'), ['2']);
  });

  it('needs every word', () => {
    assert.deepEqual(ids('plano junta'), ['1']);
    assert.deepEqual(ids('plano reportes'), []);
  });
});

describe('message', () => {
  it('takes only its own', () => {
    assert.equal(readArtifactsMessage({ type: 'upcomingMeetings', meetings: [] }), null);
    assert.equal(readArtifactsMessage({ type: 'artifactsList' }), null);
    const msg = { type: 'artifactsList', artifacts: [], scanning: true };
    assert.deepEqual(readArtifactsMessage(msg), msg);
  });
});
