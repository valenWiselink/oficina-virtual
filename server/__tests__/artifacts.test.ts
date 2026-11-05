import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactsList } from '../../core/src/messages.js';
import {
  absorbRecord,
  type ArtifactIndex,
  emptyIndex,
  parseArtifactUrl,
  type PendingCalls,
  refreshAgentNames,
  UNTITLED_ARTIFACT,
  visibleArtifacts,
} from '../src/artifacts/artifactIndex.js';
import { ARTIFACTS_POLL_MS, ArtifactWatch } from '../src/artifacts/artifactWatch.js';
import { listTranscripts, readNewLines } from '../src/artifacts/transcriptLines.js';
import { PRIVILEGED_ONLY_BROADCASTS } from '../src/httpServer.js';

const ID_A = 'AAAAaaaa11112222bbbbCC';
const ID_B = 'BBBBbbbb33334444ccccDD';
const ID_C = 'CCCCcccc55556666ddddEE';
const UUID = '11111111-2222-4333-8444-555555555555';
const link = (id: string) => `https://claude.ai/artifact/${id}`;
const iso = (minute: number) => new Date(Date.UTC(2026, 10, 5, 12, minute)).toISOString();

let nextCall = 0;

/** A call and its answer, as Claude Code writes them. */
function exchange(input: Record<string, unknown>, answer: unknown, opts: Extra = {}): Rec[] {
  const id = `toolu_${++nextCall}`;
  const at = iso(opts.minute ?? 0);
  const who = { sessionId: opts.sessionId ?? 'session-1', cwd: opts.cwd ?? 'F:\\work\\repo' };
  return [
    {
      type: 'assistant',
      timestamp: at,
      ...who,
      message: { content: [{ type: 'tool_use', id, name: opts.tool ?? 'Artifact', input }] },
    },
    {
      type: 'user',
      timestamp: at,
      ...who,
      ...(answer === undefined ? {} : { toolUseResult: answer }),
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: opts.text ?? 'ok',
            ...(opts.isError ? { is_error: true } : {}),
          },
        ],
      },
    },
  ];
}

type Rec = { [key: string]: unknown };
interface Extra {
  minute?: number;
  sessionId?: string;
  cwd?: string;
  tool?: string;
  text?: string;
  isError?: boolean;
}

const publish = (id: string, title: string, opts: Extra = {}) =>
  exchange({ file_path: 'page.html' }, { url: link(id), title, artifact_id: 'x' }, opts);

const list = (rows: Array<[string, string, number?]>, opts: Extra & { total?: number } = {}) =>
  exchange(
    { action: 'list', limit: 200 },
    {
      artifacts: rows.map(([id, title, minute]) => ({
        title,
        url: link(id),
        updatedAt: iso(minute ?? 0),
      })),
      total: opts.total ?? rows.length,
    },
    opts,
  );

function indexOf(...records: Rec[][]): ArtifactIndex {
  const index = emptyIndex();
  const pending: PendingCalls = {};
  for (const record of records.flat()) absorbRecord(index, record, pending);
  return index;
}

describe('artifact links', () => {
  it('accepts both shapes and keeps nothing but the link', () => {
    expect(parseArtifactUrl(`${link(ID_A)}?share=1`)).toEqual({ id: ID_A, url: link(ID_A) });
    expect(parseArtifactUrl(`https://claude.ai/code/artifact/${UUID}`)).toEqual({
      id: UUID,
      url: `https://claude.ai/code/artifact/${UUID}`,
    });
  });

  it.each([
    'https://evil.example/artifact/AAAAaaaa11112222',
    'http://claude.ai/artifact/AAAAaaaa11112222',
    'https://claude.ai/artifact/{id}',
    'https://claude.ai/code/artifacts',
    42,
  ])('refuses %s', (value) => {
    expect(parseArtifactUrl(value)).toBeUndefined();
  });
});

describe('reading a transcript', () => {
  it('takes link, title, session and folder from a publish', () => {
    const index = indexOf(publish(ID_A, 'Plan', { minute: 3, cwd: 'F:\\work\\repo' }));
    expect(index.artifacts[ID_A]).toMatchObject({
      url: link(ID_A),
      title: 'Plan',
      at: Date.parse(iso(3)),
      sessionId: 'session-1',
      folder: 'repo',
    });
  });

  it('gets the folder out of a POSIX path as well', () => {
    const index = indexOf(publish(ID_A, 'Plan', { cwd: '/home/ana/repo' }));
    expect(index.artifacts[ID_A].folder).toBe('repo');
  });

  it('falls back to the answer text if the structured result is missing', () => {
    const index = indexOf(
      exchange({ title: 'Del input' }, undefined, {
        text: `Published F:\\a\\b.html at ${link(ID_A)} (Version 2, version id 1)`,
      }),
    );
    expect(index.artifacts[ID_A]).toMatchObject({ url: link(ID_A), title: 'Del input' });
  });

  it('counts what is created from a type (a doc, a design)', () => {
    const index = indexOf(
      exchange(
        { type_url: link(ID_B), title: 'Doc nuevo' },
        { url: link(ID_A), title: 'Doc nuevo', created_from_type: link(ID_B) },
        { text: `Created a new Artifact at ${link(ID_A)} (version 1) from the type ${link(ID_B)}` },
      ),
    );
    expect(Object.keys(index.artifacts)).toEqual([ID_A]);
  });

  it('with no structured answer, the first link of the text is the artifact', () => {
    const index = indexOf(
      exchange({ type_url: link(ID_B), title: 'Doc' }, undefined, {
        text: `Created a new Artifact at ${link(ID_A)} (version 1) from the type ${link(ID_B)}`,
      }),
    );
    expect(Object.keys(index.artifacts)).toEqual([ID_A]);
  });

  it('names something without a title, rather than losing it', () => {
    const index = indexOf(exchange({}, { url: link(ID_A) }));
    expect(index.artifacts[ID_A].title).toBe(UNTITLED_ARTIFACT);
  });

  it('a republish moves it up and keeps one row', () => {
    const index = indexOf(
      publish(ID_A, 'Primero', { minute: 1 }),
      publish(ID_B, 'Otro', { minute: 2 }),
      publish(ID_A, 'Corregido', { minute: 3, sessionId: 'session-2' }),
    );
    const rows = visibleArtifacts(index);
    expect(rows.map((r) => r.id)).toEqual([ID_A, ID_B]);
    expect(rows[0].title).toBe('Corregido');
    expect(index.artifacts[ID_A].sessionId).toBe('session-2');
  });

  it('reading older transcripts later does not roll anything back', () => {
    const index = indexOf(
      publish(ID_A, 'Nuevo', { minute: 9, sessionId: 'session-2' }),
      publish(ID_A, 'Viejo', { minute: 1, sessionId: 'session-1' }),
    );
    expect(index.artifacts[ID_A]).toMatchObject({ title: 'Nuevo', sessionId: 'session-2' });
  });

  it('a call and its answer may come in different reads', () => {
    const index = emptyIndex();
    const pending: PendingCalls = {};
    const [call, answer] = publish(ID_A, 'Plan');
    absorbRecord(index, call, pending);
    expect(visibleArtifacts(index)).toEqual([]);
    expect(Object.keys(pending)).toHaveLength(1);
    expect(absorbRecord(index, answer, pending)).toBe(true);
    expect(pending).toEqual({});
  });

  it.each([
    ['a failed publish', publish(ID_A, 'Plan', { isError: true })],
    ['another tool', publish(ID_A, 'Plan', { tool: 'Bash' })],
    ['an asset upload', exchange({ asset: true, url: link(ID_B) }, { url: link(ID_A) })],
    ['someone reading an artifact', exchange({ action: 'read' }, { url: link(ID_A) })],
    ['a text that only mentions a link', exchange({}, undefined, { text: `Mirá ${link(ID_A)}` })],
  ])('ignores %s', (_label, records) => {
    expect(visibleArtifacts(indexOf(records))).toEqual([]);
  });

  it('ignores the old messages an api-request-blob repeats', () => {
    const [call, answer] = publish(ID_A, 'Plan');
    const blob = (r: Rec) => ({ ...r, type: 'api-request-blob', timestamp: undefined });
    expect(visibleArtifacts(indexOf([blob(call), blob(answer)]))).toEqual([]);
  });

  it('a record without a usable time counts for nothing', () => {
    const [call, answer] = publish(ID_A, 'Plan');
    expect(visibleArtifacts(indexOf([call, { ...answer, timestamp: 'nunca' }]))).toEqual([]);
  });
});

describe('what a listing adds', () => {
  it('brings what no transcript publishes, with nobody behind it', () => {
    const rows = visibleArtifacts(indexOf(list([[ID_A, 'Viejo', 1]], { minute: 5 })));
    expect(rows).toEqual([{ id: ID_A, url: link(ID_A), title: 'Viejo', at: Date.parse(iso(1)) }]);
  });

  it('never shows what others shared with you', () => {
    const rows = (scope: string) =>
      exchange(
        { action: 'list', scope },
        { artifacts: [{ title: 'Ajeno', url: link(ID_A), updatedAt: iso(1) }], total: 1 },
      );
    expect(visibleArtifacts(indexOf(rows('all')))).toEqual([]);
    expect(visibleArtifacts(indexOf(rows('shared')))).toEqual([]);
    expect(visibleArtifacts(indexOf(rows('mine')))).toHaveLength(1);
  });

  it('nor a listing of one type of artifact, which says nothing of the rest', () => {
    const typed = exchange(
      { action: 'list', type: 'Slides' },
      { artifacts: [{ title: 'Mazo', url: link(ID_A), updatedAt: iso(1) }], total: 1 },
    );
    expect(visibleArtifacts(indexOf(publish(ID_B, 'Sigue'), typed)).map((r) => r.id)).toEqual([
      ID_B,
    ]);
  });

  it('a publish older than the listing still says who made it', () => {
    const index = indexOf(
      list([[ID_A, 'Plan', 9]], { minute: 10 }),
      publish(ID_A, 'Plan viejo', { minute: 1 }),
    );
    expect(index.artifacts[ID_A]).toMatchObject({ title: 'Plan', sessionId: 'session-1' });
  });

  it('a listing that reached the end takes out what it no longer names', () => {
    const index = indexOf(
      publish(ID_A, 'Borrado en la web', { minute: 1 }),
      publish(ID_B, 'Sigue', { minute: 2 }),
      list([[ID_B, 'Sigue', 2]], { minute: 30 }),
    );
    expect(visibleArtifacts(index).map((r) => r.id)).toEqual([ID_B]);
  });

  it('whatever the order the transcripts are read in', () => {
    const index = indexOf(
      list([[ID_B, 'Sigue', 2]], { minute: 30 }),
      publish(ID_B, 'Sigue', { minute: 2 }),
      publish(ID_A, 'Borrado en la web', { minute: 1 }),
    );
    expect(visibleArtifacts(index).map((r) => r.id)).toEqual([ID_B]);
  });

  it('a page of a listing takes nothing out', () => {
    const index = indexOf(
      publish(ID_A, 'Afuera de la página', { minute: 1 }),
      list([[ID_B, 'En la página', 2]], { minute: 30, total: 131 }),
    );
    expect(
      visibleArtifacts(index)
        .map((r) => r.id)
        .sort(),
    ).toEqual([ID_A, ID_B]);
  });

  it('what was published after the listing stays', () => {
    const index = indexOf(
      list([[ID_B, 'Sigue', 2]], { minute: 30 }),
      publish(ID_A, 'Nuevo', { minute: 31 }),
    );
    expect(visibleArtifacts(index).map((r) => r.id)).toEqual([ID_A, ID_B]);
  });

  it('an old uuid link hands its agent to the row with its very title', () => {
    const old = exchange(
      { file_path: 'a.html' },
      { url: `https://claude.ai/code/artifact/${UUID}`, title: 'Auditoría' },
      { minute: 1 },
    );
    const index = indexOf(old, list([[ID_A, 'Auditoría', 1]], { minute: 30 }));
    refreshIndexNames(index, { 'session-1': 'Agente viejo' });
    expect(visibleArtifacts(index)).toEqual([
      {
        id: ID_A,
        url: link(ID_A),
        title: 'Auditoría',
        at: Date.parse(iso(1)),
        agent: 'Agente viejo',
        folder: 'repo',
      },
    ]);
  });

  it('never guesses between two rows with the same title', () => {
    const old = exchange(
      { file_path: 'a.html' },
      { url: `https://claude.ai/code/artifact/${UUID}`, title: 'Plan' },
      { minute: 1 },
    );
    const index = indexOf(
      old,
      list(
        [
          [ID_A, 'Plan', 1],
          [ID_B, 'Plan', 2],
        ],
        { minute: 30 },
      ),
    );
    expect(visibleArtifacts(index).every((r) => r.agent === undefined)).toBe(true);
  });
});

function refreshIndexNames(index: ArtifactIndex, names: { [id: string]: string }) {
  refreshAgentNames(index, (id) => names[id]);
}

describe('what was removed', () => {
  const remove = (id: string, minute: number, extra: Rec = {}) =>
    exchange({ action: 'delete', url: link(id), ...extra }, {}, { minute });

  it('an agent deleting one takes it out', () => {
    const index = indexOf(publish(ID_A, 'Plan', { minute: 1 }), remove(ID_A, 2));
    expect(visibleArtifacts(index)).toEqual([]);
  });

  it('a delete read before the publish it follows still counts', () => {
    const index = indexOf(remove(ID_A, 2), publish(ID_A, 'Plan', { minute: 1 }));
    expect(visibleArtifacts(index)).toEqual([]);
  });

  it('removing one of its assets is not removing it', () => {
    const index = indexOf(publish(ID_A, 'Plan', { minute: 1 }), remove(ID_A, 2, { path: 'abc' }));
    expect(visibleArtifacts(index)).toHaveLength(1);
  });

  it('a failed delete changes nothing', () => {
    const failed = exchange(
      { action: 'delete', url: link(ID_A) },
      {},
      { minute: 2, isError: true },
    );
    expect(visibleArtifacts(indexOf(publish(ID_A, 'Plan', { minute: 1 }), failed))).toHaveLength(1);
  });
});

describe('who made it', () => {
  const title = (kind: 'ai-title' | 'custom-title', value: string): Rec => ({
    type: kind,
    sessionId: 'session-1',
    ...(kind === 'ai-title' ? { aiTitle: value } : { customTitle: value }),
  });
  const named = (...titles: Rec[]) => {
    const index = indexOf(titles, publish(ID_A, 'Plan'));
    refreshAgentNames(index);
    return visibleArtifacts(index)[0].agent;
  };

  it('is the session title; /rename beats the generated one', () => {
    expect(named(title('ai-title', 'Generado'))).toBe('Generado');
    expect(named(title('ai-title', 'Generado'), title('custom-title', 'A mano'))).toBe('A mano');
  });

  it('not the name the office gives its background sessions', () => {
    expect(named(title('custom-title', 'oficina-foo-1a2b'), title('ai-title', 'Generado'))).toBe(
      'Generado',
    );
  });

  it('the name given in the office beats them all', () => {
    const index = indexOf([title('ai-title', 'Generado')], publish(ID_A, 'Plan'));
    refreshAgentNames(index, () => 'Apodo');
    expect(visibleArtifacts(index)[0].agent).toBe('Apodo');
  });

  it('a title written after the publish still names it', () => {
    const index = indexOf(publish(ID_A, 'Plan'), [title('ai-title', 'Tardío')]);
    refreshAgentNames(index);
    expect(visibleArtifacts(index)[0].agent).toBe('Tardío');
  });

  it('keeps the last name once nothing says it any more', () => {
    const index = indexOf([title('ai-title', 'Generado')], publish(ID_A, 'Plan'));
    refreshAgentNames(index);
    index.titles = {};
    refreshAgentNames(index);
    expect(visibleArtifacts(index)[0].agent).toBe('Generado');
  });

  it('only what the panel shows reaches the page', () => {
    const index = indexOf([title('ai-title', 'Generado')], publish(ID_A, 'Plan'));
    refreshAgentNames(index);
    expect(Object.keys(visibleArtifacts(index)[0]).sort()).toEqual([
      'agent',
      'at',
      'folder',
      'id',
      'title',
      'url',
    ]);
  });
});

describe('reading only what grew', () => {
  let dir: string;
  const lines = async (file: string, from = 0) => {
    const seen: string[] = [];
    const offset = await readNewLines(file, from, (l) => seen.push(l));
    return { seen, offset };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-artifact-lines-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips lines without a marker and continues where it stopped', async () => {
    const file = path.join(dir, 'a.jsonl');
    fs.writeFileSync(file, 'nada\n"Artifact" uno\n');
    const first = await lines(file);
    expect(first.seen).toEqual(['"Artifact" uno']);
    expect(first.offset).toBe(fs.statSync(file).size);
    fs.appendFileSync(file, '"ai-title" dos\n');
    const second = await lines(file, first.offset);
    expect(second.seen).toEqual(['"ai-title" dos']);
  });

  it('a half-written line waits for the next read', async () => {
    const file = path.join(dir, 'a.jsonl');
    fs.writeFileSync(file, '"Artifact" uno\n"Artifact" mit');
    const first = await lines(file);
    expect(first.seen).toEqual(['"Artifact" uno']);
    fs.appendFileSync(file, 'ad\n');
    const second = await lines(file, first.offset);
    expect(second.seen).toEqual(['"Artifact" mitad']);
  });

  it('keeps a line that spans chunks, accents intact', async () => {
    const file = path.join(dir, 'a.jsonl');
    const long = `"Artifact" ${'á'.repeat(1024 * 1024)} fin`;
    fs.writeFileSync(file, `${long}\ncorta\n`);
    const { seen } = await lines(file);
    expect(seen).toEqual([long]);
  });

  it('survives a line too long to keep', async () => {
    const file = path.join(dir, 'a.jsonl');
    const huge = `"Artifact" ${'x'.repeat(17 * 1024 * 1024)}`;
    fs.writeFileSync(file, `${huge}\n"Artifact" después\n`);
    const { seen, offset } = await lines(file);
    expect(seen).toEqual(['"Artifact" después']);
    expect(offset).toBe(fs.statSync(file).size);
  });

  it('finds sub-agents and workflows, and nothing else', async () => {
    const nested = path.join(dir, 'project', 'session', 'subagents');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project', 'main.jsonl'), 'x');
    fs.writeFileSync(path.join(nested, 'agent-1.jsonl'), 'x');
    fs.writeFileSync(path.join(nested, 'notes.txt'), 'x');
    const found = (await listTranscripts(dir)).map((f) => path.basename(f.file)).sort();
    expect(found).toEqual(['agent-1.jsonl', 'main.jsonl']);
  });

  it('a root that does not exist is simply empty', async () => {
    await expect(listTranscripts(path.join(dir, 'nope'))).resolves.toEqual([]);
  });
});

describe('the watch', () => {
  let root: string;
  let indexFile: string;
  let sent: ArtifactsList[];
  let clock: number;

  const watch = (nameOf?: (id: string) => string | undefined) =>
    new ArtifactWatch({
      broadcast: (m) => sent.push(m),
      roots: () => [root],
      file: indexFile,
      now: () => clock,
      nameOf,
    });
  const write = (rel: string, records: Rec[]) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, records.map((r) => `${JSON.stringify(r)}\n`).join(''));
    return file;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-artifact-root-'));
    indexFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-artifact-idx-')), 'a.json');
    sent = [];
    clock = 1_000_000;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(indexFile), { recursive: true, force: true });
  });

  it('starts out scanning, then says it is done', async () => {
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    const w = watch();
    expect(w.message()).toEqual({ type: 'artifactsList', artifacts: [], scanning: true });
    await w.poll();
    expect(w.message().scanning).toBe(false);
    expect(w.message().artifacts.map((a) => a.id)).toEqual([ID_A]);
    expect(sent.at(-1)).toEqual(w.message());
    w.stop();
  });

  it('a brand-new agent, in a brand-new folder, shows up with no setup', async () => {
    write('p/s1.jsonl', publish(ID_A, 'Plan', { minute: 1 }));
    const w = watch();
    await w.poll();
    write('otro-proyecto/s2.jsonl', publish(ID_B, 'Del nuevo', { minute: 2, sessionId: 's2' }));
    await w.poll();
    expect(sent.at(-1)?.artifacts.map((a) => a.id)).toEqual([ID_B, ID_A]);
    w.stop();
  });

  it('counts what sub-agents publish, under their parent session', async () => {
    write('p/s1.jsonl', [{ type: 'ai-title', sessionId: 's1', aiTitle: 'Padre' }]);
    write('p/s1/subagents/agent-1.jsonl', publish(ID_A, 'De un sub-agente', { sessionId: 's1' }));
    const w = watch();
    await w.poll();
    expect(w.message().artifacts[0]).toMatchObject({ id: ID_A, agent: 'Padre' });
    w.stop();
  });

  it('survives a restart and a transcript being cleaned up', async () => {
    const file = write('p/s1.jsonl', [
      { type: 'ai-title', sessionId: 'session-1', aiTitle: 'Agente' },
      ...publish(ID_A, 'Plan'),
    ]);
    const first = watch();
    await first.poll();
    first.stop();

    fs.rmSync(file);
    const second = watch();
    expect(second.message().artifacts).toMatchObject([{ id: ID_A, agent: 'Agente' }]);
    expect(second.message().scanning).toBe(false);
    await second.poll();
    expect(second.message().artifacts).toHaveLength(1);
    second.stop();
  });

  it('a restart does not read everything again, and keeps calls across reads', async () => {
    const [call, answer] = publish(ID_A, 'Plan');
    const file = write('p/s1.jsonl', [call]);
    const first = watch();
    await first.poll();
    expect(first.message().artifacts).toEqual([]);
    first.stop();

    const saved = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as {
      files: { [file: string]: { offset: number } };
    };
    expect(saved.files[file].offset).toBe(fs.statSync(file).size);
    fs.appendFileSync(file, `${JSON.stringify(answer)}\n`);
    const second = watch();
    await second.poll();
    expect(second.message().artifacts.map((a) => a.id)).toEqual([ID_A]);
    second.stop();
  });

  it('a transcript rewritten shorter is read again', async () => {
    const file = write('p/s1.jsonl', publish(ID_A, 'Plan', { minute: 1 }));
    const w = watch();
    await w.poll();
    fs.writeFileSync(file, '');
    write('p/s1.jsonl', publish(ID_C, 'C', { minute: 3 }));
    await w.poll();
    expect(w.message().artifacts.map((a) => a.id)).toEqual([ID_C, ID_A]);
    w.stop();
  });

  it('a damaged index starts over from the transcripts', async () => {
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    fs.writeFileSync(indexFile, '{ no es json');
    const w = watch();
    await w.poll();
    expect(w.message().artifacts).toHaveLength(1);
    w.stop();
  });

  it('a damaged line costs that line only', async () => {
    const file = write('p/s1.jsonl', []);
    fs.appendFileSync(file, '{"Artifact" roto\n');
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    const w = watch();
    await w.poll();
    expect(w.message().artifacts).toHaveLength(1);
    w.stop();
  });

  it('does not repeat itself when nothing changed', async () => {
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    const w = watch();
    await w.poll();
    const after = sent.length;
    await w.poll();
    expect(sent).toHaveLength(after);
    w.stop();
  });

  it('a name given later reaches an artifact already known', async () => {
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    let nick: string | undefined;
    const w = watch(() => nick);
    await w.poll();
    nick = 'Apodo';
    await w.poll();
    expect(sent.at(-1)?.artifacts[0].agent).toBe('Apodo');
    w.stop();
  });

  it('polls only while a tokened page is open', async () => {
    vi.useFakeTimers();
    try {
      write('p/s1.jsonl', publish(ID_A, 'Plan'));
      const w = watch();
      const poll = vi.spyOn(w, 'poll');
      await vi.advanceTimersByTimeAsync(ARTIFACTS_POLL_MS * 3);
      expect(poll).not.toHaveBeenCalled();
      w.clientJoined();
      await vi.advanceTimersByTimeAsync(0);
      expect(poll).toHaveBeenCalledTimes(1);
      w.clientLeft();
      const calls = poll.mock.calls.length;
      await vi.advanceTimersByTimeAsync(ARTIFACTS_POLL_MS * 3);
      expect(poll.mock.calls.length).toBe(calls);
      w.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs nothing of the artifacts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    write('p/s1.jsonl', publish(ID_A, 'Título secreto'));
    const w = watch();
    await w.poll();
    w.stop();
    expect(log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('touches only local files: the network is never used', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    write('p/s1.jsonl', publish(ID_A, 'Plan'));
    const w = watch();
    await w.poll();
    w.stop();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('who gets the artifacts', () => {
  it('never a read-only client', () => {
    expect(PRIVILEGED_ONLY_BROADCASTS.has('artifactsList')).toBe(true);
  });
});
