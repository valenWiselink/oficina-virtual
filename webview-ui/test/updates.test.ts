import { describe, expect, it } from 'vitest';

import { normalizeReleaseNotes, whatsNewOnStart } from '../../desktop/updateNotes.js';
import type { UpdateState } from '../src/updates/desktopUpdates.js';
import {
  busyCount,
  isBusy,
  nextQuietSince,
  QUIET_BEFORE_INSTALL_MS,
  quietLongEnough,
} from '../src/updates/installWhenIdle.js';
import { noteLines, releaseUrl } from '../src/updates/releaseNotesText.js';
import { agentsWord, checkAnswerText, settingsCheckText } from '../src/updates/updateWords.js';
import type { AgentKind, AgentView } from '../src/views/agentViews.js';

const view = (id: number, kind: AgentKind, blocking?: boolean): AgentView =>
  ({ id, kind, blocking }) as AgentView;

const state = (over: Partial<UpdateState> = {}): UpdateState => ({
  enabled: true,
  current: '1.0.15',
  status: 'none',
  notes: [],
  whenIdle: false,
  ...over,
});

describe('normalizeReleaseNotes', () => {
  it('turns the latest-only string into one note for that version', () => {
    expect(normalizeReleaseNotes('<p>Hola</p>', '1.0.16')).toEqual([
      { version: '1.0.16', note: '<p>Hola</p>' },
    ]);
  });

  it('keeps fullChangelog entries in order and drops empty or broken ones', () => {
    const raw = [
      { version: '1.0.17', note: 'nuevo' },
      { version: '1.0.16', note: '   ' },
      null,
      { version: '1.0.15', note: 42 },
      { note: 'sin versión' },
    ];
    expect(normalizeReleaseNotes(raw, '1.0.17')).toEqual([
      { version: '1.0.17', note: 'nuevo' },
      { version: '1.0.17', note: 'sin versión' },
    ]);
  });

  it('reads null or an empty string as no notes', () => {
    expect(normalizeReleaseNotes(null, '1.0.16')).toEqual([]);
    expect(normalizeReleaseNotes('', '1.0.16')).toEqual([]);
  });
});

describe('whatsNewOnStart', () => {
  const notes = [{ version: '1.0.16', note: 'trae cosas' }];

  it('says nothing on a fresh install', () => {
    expect(whatsNewOnStart({ hadState: false }, '1.0.16')).toBeUndefined();
  });

  it('says nothing when the same version starts again', () => {
    expect(whatsNewOnStart({ lastVersion: '1.0.16', hadState: true }, '1.0.16')).toBeUndefined();
  });

  it('brings the downloaded notes when they are for this version', () => {
    const memory = {
      lastVersion: '1.0.15',
      pendingUpdate: { version: '1.0.16', notes },
      hadState: true,
    };
    expect(whatsNewOnStart(memory, '1.0.16')).toEqual({ version: '1.0.16', notes });
  });

  it('has no notes when the saved ones are for another version', () => {
    const memory = {
      lastVersion: '1.0.15',
      pendingUpdate: { version: '1.0.17', notes },
      hadState: true,
    };
    expect(whatsNewOnStart(memory, '1.0.16')).toEqual({ version: '1.0.16', notes: [] });
  });

  it('counts a start from a version that never recorded itself as an update', () => {
    expect(whatsNewOnStart({ hadState: true }, '1.0.15')).toEqual({
      version: '1.0.15',
      notes: [],
    });
  });
});

describe('noteLines', () => {
  it('reads GitHub HTML as text lines, lists as bullets', () => {
    const html =
      '<h2>Novedades</h2>\n<ul>\n<li>Aviso <strong>dentro</strong> de la oficina</li>\n<li>Ajustes &rarr; Ayuda &amp; versión</li>\n</ul>';
    expect(noteLines(html)).toEqual([
      'Novedades',
      '• Aviso dentro de la oficina',
      '• Ajustes → Ayuda & versión',
    ]);
  });

  it('never keeps markup, even escaped markup turns into plain text', () => {
    const lines = noteLines('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><img src=x onerror=y>');
    expect(lines).toEqual(['<script>alert(1)</script>']);
  });

  it('reads markdown too', () => {
    expect(noteLines('## Qué trae\n- **Avisos** que no frenan\n* `async` en los hooks')).toEqual([
      'Qué trae',
      '• Avisos que no frenan',
      '• async en los hooks',
    ]);
  });

  it('decodes numeric entities', () => {
    expect(noteLines('Ayuda &#38; versi&#xF3;n')).toEqual(['Ayuda & versión']);
  });

  it('links to the release of that version', () => {
    expect(releaseUrl('1.0.16')).toBe(
      'https://github.com/valenWiselink/oficina-virtual/releases/tag/v1.0.16',
    );
  });
});

describe('install when nobody works', () => {
  it('counts working kinds and blocking needs as busy, not finished or idle ones', () => {
    expect(isBusy(view(1, 'work'))).toBe(true);
    expect(isBusy(view(1, 'think'))).toBe(true);
    expect(isBusy(view(1, 'meet'))).toBe(true);
    expect(isBusy(view(1, 'research'))).toBe(true);
    expect(isBusy(view(1, 'needs', true))).toBe(true);
    expect(isBusy(view(1, 'needs', false))).toBe(false);
    expect(isBusy(view(1, 'done'))).toBe(false);
    expect(isBusy(view(1, 'idle'))).toBe(false);
  });

  it('adds held permissions whose agent is not on the board', () => {
    const views = [view(1, 'needs', true), view(2, 'done')];
    expect(busyCount(views, [{ id: 1 }])).toBe(1);
    expect(busyCount(views, [{ id: 1 }, { id: undefined }, { id: 9 }])).toBe(3);
  });

  it('installs only after a quiet stretch, and any work restarts the wait', () => {
    let since = nextQuietSince(null, false, 1_000);
    expect(since).toBe(1_000);
    since = nextQuietSince(since, false, 20_000);
    expect(quietLongEnough(since, 20_000)).toBe(false);
    since = nextQuietSince(since, true, 25_000);
    expect(since).toBeNull();
    since = nextQuietSince(since, false, 26_000);
    expect(quietLongEnough(since, 26_000 + QUIET_BEFORE_INSTALL_MS - 1)).toBe(false);
    expect(quietLongEnough(since, 26_000 + QUIET_BEFORE_INSTALL_MS)).toBe(true);
  });
});

describe('update words', () => {
  it('says how many agents', () => {
    expect(agentsWord(1)).toBe('un agente');
    expect(agentsWord(3)).toBe('3 agentes');
  });

  it('answers a manual check only while fresh, a download while it lasts', () => {
    const manual = { at: 1, outcome: 'none' as const, manual: true };
    expect(checkAnswerText(state({ lastCheck: manual }), true)).toBe(
      'Tenés la última versión (1.0.15).',
    );
    expect(checkAnswerText(state({ lastCheck: manual }), false)).toBeUndefined();
    const found = { at: 1, outcome: 'found' as const, manual: true };
    expect(
      checkAnswerText(state({ status: 'downloading', version: '1.0.16', lastCheck: found }), false),
    ).toBe('Encontré la 1.0.16. La estoy bajando y te aviso acá.');
    const automatic = { at: 1, outcome: 'none' as const, manual: false };
    expect(checkAnswerText(state({ lastCheck: automatic }), true)).toBeUndefined();
  });

  it('words Ajustes → Ayuda for every state', () => {
    expect(settingsCheckText(state({ enabled: false }))).toBe('Esta copia no se actualiza sola.');
    expect(settingsCheckText(state({ status: 'ready', version: '1.0.16' }))).toContain(
      'La 1.0.16 está lista',
    );
    expect(settingsCheckText(state({ status: 'downloading', version: '1.0.16' }))).toContain(
      'La estoy bajando',
    );
    expect(settingsCheckText(state({ status: 'error' }))).toBe(
      'No pude buscar ahora. Probá más tarde.',
    );
    expect(settingsCheckText(state())).toBe('Tenés la última versión.');
  });
});
