import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentStateStore } from '../src/agentStateStore.js';
import { SERVER_JSON_DIR } from '../src/constants.js';
import { synthesize } from '../src/voice/speech.js';
import { handleVoiceMessage, OutageNotice } from '../src/voice/voiceMessages.js';
import { ELEVEN_DEFAULT_VOICE, FISH_DEFAULT_VOICE } from '../src/voice/voiceSettings.js';

type Call = { url: string; init: RequestInit };

/** A fake fetch that answers ElevenLabs and Fish separately. */
function services(answers: { eleven?: () => Response; fish?: () => Response }) {
  const calls: Call[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = url.includes('/text-to-speech/') ? answers.eleven : answers.fish;
    return answer?.() ?? new Response('', { status: 500 });
  }) as unknown as typeof fetch;
  return { calls, fake };
}

const mp3 = () => new Response('MP3', { status: 200 });
const noCredit = () =>
  new Response(JSON.stringify({ detail: { status: 'quota_exceeded' } }), { status: 401 });

describe('the voices by default', () => {
  it('ElevenLabs speaks with Edoardo and Fish with Marcus', async () => {
    const { calls, fake } = services({ eleven: mp3, fish: mp3 });
    await synthesize('Hola.', { engine: 'elevenlabs', elevenKey: 'e' }, fake);
    await synthesize('Hola.', { engine: 'fish', fishKey: 'f' }, fake);
    expect(ELEVEN_DEFAULT_VOICE).toBe('YqZLNYWZm98oKaaLZkUA');
    expect(FISH_DEFAULT_VOICE).toBe('93dc4e3a1a494d58ad0f50f712b8b152');
    expect(calls[0].url).toContain(`/text-to-speech/${ELEVEN_DEFAULT_VOICE}?`);
    expect(JSON.parse(String(calls[1].init.body)).reference_id).toBe(FISH_DEFAULT_VOICE);
  });

  it('tells a spent quota from a bad key', async () => {
    const spent = services({ eleven: noCredit });
    expect(await synthesize('x', { engine: 'elevenlabs', elevenKey: 'e' }, spent.fake)).toEqual({
      ok: false,
      reason: 'ElevenLabs dice que no hay crédito',
    });
    const bad = services({ eleven: () => new Response('{}', { status: 401 }) });
    expect(await synthesize('x', { engine: 'elevenlabs', elevenKey: 'e' }, bad.fake)).toEqual({
      ok: false,
      reason: 'ElevenLabs no acepta la clave: revisala en Ajustes',
    });
  });
});

describe('the outage notice', () => {
  it('is said once, and again only after ElevenLabs worked', () => {
    const outage = new OutageNotice();
    expect(outage.failed('Sin crédito', 'Sigo con Fish.')).toBe('Sin crédito. Sigo con Fish.');
    expect(outage.failed('Sin crédito', 'Sigo con Fish.')).toBeUndefined();
    outage.worked();
    expect(outage.failed('Sin crédito', 'Sigo con Fish.')).toBeDefined();
  });
});

describe('when ElevenLabs cannot, Jarvis does not go mute', () => {
  let home: string;
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const JARVIS = 4;
  let reply = 'Listo, señor.';
  // Answers to Valentín: those are said aloud whole (voice/turnAuthor.ts).
  const jarvis = () => ({
    supervision: { kind: 'all' },
    sessionId: 's',
    lastReply: reply,
    turnByValentin: true,
  });
  const store = {
    entries: () => [[JARVIS, jarvis()]][Symbol.iterator](),
    get: (id: number) => (id === JARVIS ? jarvis() : undefined),
  } as unknown as AgentStateStore;

  function settings(value: Record<string, unknown>) {
    const dir = path.join(home, SERVER_JSON_DIR, 'jarvis');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'voz.json'), JSON.stringify(value));
  }

  /** Handle one message and wait for its answer. */
  function ask(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve) => handleVoiceMessage(msg, resolve, store));
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-respaldo-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HOME = saved.HOME;
    process.env.USERPROFILE = saved.USERPROFILE;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('speaks with Fish (Marcus) and says so once, until ElevenLabs works again', async () => {
    settings({ engine: 'elevenlabs', elevenKey: 'e', fishKey: 'f' });
    let eleven = noCredit;
    const { calls, fake } = services({ eleven: () => eleven(), fish: mp3 });
    vi.stubGlobal('fetch', fake);

    reply = 'Primera respuesta.';
    const first = await ask({ type: 'jarvisSay', key: 'a', id: JARVIS });
    expect(first).toMatchObject({ type: 'jarvisVoice', key: 'a', mime: 'audio/mpeg' });
    expect(first.notice).toBe('ElevenLabs dice que no hay crédito. Mientras tanto hablo con Fish.');
    const fishCall = calls.find((c) => !c.url.includes('/text-to-speech/'));
    expect(JSON.parse(String(fishCall?.init.body)).reference_id).toBe(FISH_DEFAULT_VOICE);

    reply = 'Segunda respuesta.';
    const second = await ask({ type: 'jarvisSay', key: 'b', id: JARVIS });
    expect(second).toMatchObject({ type: 'jarvisVoice', key: 'b' });
    expect(second.notice).toBeUndefined();

    // It has credit again, then runs out: told again.
    eleven = mp3;
    reply = 'Tercera respuesta.';
    expect(await ask({ type: 'jarvisSay', key: 'c', id: JARVIS })).toMatchObject({
      type: 'jarvisVoice',
    });
    eleven = noCredit;
    reply = 'Cuarta respuesta.';
    const fourth = await ask({ type: 'jarvisSay', key: 'd', id: JARVIS });
    expect(fourth.notice).toBeDefined();

    // Works again, so the next test starts with nothing said (the notice is the office's).
    eleven = mp3;
    reply = 'Quinta respuesta.';
    await ask({ type: 'jarvisSay', key: 'e', id: JARVIS });
  });

  it('falls back with no ElevenLabs key too', async () => {
    settings({ engine: 'elevenlabs', fishKey: 'f' });
    vi.stubGlobal('fetch', services({ fish: mp3 }).fake);
    reply = 'Sin clave de ElevenLabs.';
    const r = await ask({ type: 'jarvisSay', key: 'k', id: JARVIS });
    expect(r).toMatchObject({ type: 'jarvisVoice' });
    expect(String(r.notice)).toContain('Falta la clave de ElevenLabs');
  });

  it('«Probar» in Ajustes tries ElevenLabs as it is, without Fish in its place', async () => {
    settings({ engine: 'elevenlabs', elevenKey: 'e', fishKey: 'f' });
    const { calls, fake } = services({ eleven: noCredit, fish: mp3 });
    vi.stubGlobal('fetch', fake);
    const r = await ask({ type: 'jarvisSay', key: 'p', text: 'Buenas tardes, señor.' });
    expect(r).toMatchObject({
      type: 'jarvisVoiceFailed',
      key: 'p',
      reason: 'ElevenLabs dice que no hay crédito',
    });
    expect(calls).toHaveLength(1);
  });

  it('when Fish cannot either, ElevenLabs’s reason is the one shown', async () => {
    settings({ engine: 'elevenlabs', elevenKey: 'e', fishKey: 'f' });
    vi.stubGlobal('fetch', services({ eleven: noCredit }).fake);
    reply = 'Nadie puede hablar.';
    const r = await ask({ type: 'jarvisSay', key: 'n', id: JARVIS });
    expect(r).toMatchObject({
      type: 'jarvisVoiceFailed',
      reason: 'ElevenLabs dice que no hay crédito',
    });
  });
});
