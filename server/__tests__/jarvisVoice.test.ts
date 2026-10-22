import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SpeechCache, speechText, synthesize } from '../src/voice/speech.js';
import {
  changeVoiceSettings,
  ELEVEN_DEFAULT_VOICE,
  FISH_MODEL,
  readVoiceSettings,
  voiceStatusMessage,
} from '../src/voice/voiceSettings.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-'));
  file = path.join(dir, 'voz.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('what Jarvis says aloud', () => {
  it('drops code, links, paths, markdown and the «Te toca:» label', () => {
    const said = speechText(
      [
        '## Listo, señor',
        'Coral abrió el **PR 812** en [GitHub](https://github.com/x/y/pull/812).',
        'Lo dejé en `F:\\proyectos\\app\\src\\a.ts` y corrí `npm`.',
        '```ts',
        'const x = 1;',
        '```',
        '| a | b |',
        '- primero',
        'Te toca: ¿lo mergeo a develop?',
      ].join('\n'),
    );
    expect(said).toBe(
      'Listo, señor Coral abrió el PR 812 en GitHub. Lo dejé en y corrí npm. primero ¿lo mergeo a develop?',
    );
  });

  it('cuts a long answer at a sentence end', () => {
    const long = `${'Una frase corta y clara. '.repeat(30)}`;
    const said = speechText(long, 100);
    expect(said.length).toBeLessThanOrEqual(100);
    expect(said.endsWith('.')).toBe(true);
  });
});

describe('voice settings', () => {
  it('keeps keys here and tells the browser only that there is one', () => {
    expect(readVoiceSettings(file)).toEqual({ engine: 'off' });
    const set = changeVoiceSettings(
      { engine: 'fish', fishKey: ' secreta ', fishVoice: 'abc123' },
      file,
    );
    expect(set).toMatchObject({ ok: true, settings: { engine: 'fish', fishKey: 'secreta' } });
    // A change that leaves the key out keeps it; an empty string clears it.
    changeVoiceSettings({ fishVoice: '' }, file);
    expect(readVoiceSettings(file)).toMatchObject({ fishKey: 'secreta', fishVoice: undefined });
    const status = voiceStatusMessage(readVoiceSettings(file));
    expect(status).toMatchObject({ type: 'jarvisVoiceStatus', engine: 'fish', fishKeySet: true });
    expect(JSON.stringify(status)).not.toContain('secreta');
  });

  it('refuses an unknown engine or a voice id that is not an id', () => {
    expect(changeVoiceSettings({ engine: 'robot' }, file)).toMatchObject({ ok: false });
    expect(changeVoiceSettings({ elevenVoice: '../../etc' }, file)).toMatchObject({ ok: false });
  });
});

describe('the engines', () => {
  function recorder(status = 200, body = 'MP3') {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(body, { status });
    }) as unknown as typeof fetch;
    return { calls, fake };
  }

  it('asks Fish Audio for its free model, in mp3, with the chosen voice', async () => {
    const { calls, fake } = recorder();
    const r = await synthesize(
      'Hola, señor.',
      { engine: 'fish', fishKey: 'k', fishVoice: 'v1' },
      fake,
    );
    expect(r).toMatchObject({ ok: true, mime: 'audio/mpeg' });
    expect(calls[0].url).toBe('https://api.fish.audio/v1/tts');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    expect(headers.model).toBe(FISH_MODEL);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'Hola, señor.',
      format: 'mp3',
      latency: 'balanced',
      reference_id: 'v1',
    });
  });

  it('asks ElevenLabs with its key, Flash and a default voice', async () => {
    const { calls, fake } = recorder();
    await synthesize('Hola.', { engine: 'elevenlabs', elevenKey: 'e' }, fake);
    expect(calls[0].url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_DEFAULT_VOICE}?output_format=mp3_44100_128`,
    );
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe('e');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'Hola.',
      model_id: 'eleven_flash_v2_5',
    });
  });

  it('says why, in words, when it gets no audio', async () => {
    expect(await synthesize('x', { engine: 'fish' })).toMatchObject({ ok: false });
    expect(await synthesize('x', { engine: 'off' })).toMatchObject({ ok: false });
    const bad = recorder(401);
    expect(await synthesize('x', { engine: 'fish', fishKey: 'k' }, bad.fake)).toEqual({
      ok: false,
      reason: 'Fish Audio no acepta la clave: revisala en Ajustes',
    });
    const broke = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await synthesize('x', { engine: 'elevenlabs', elevenKey: 'e' }, broke);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? '' : r.reason).toContain('No llego a ElevenLabs');
  });

  it('makes the same words once, and tries again after a failure', async () => {
    const cache = new SpeechCache();
    const ok = recorder();
    const settings = { engine: 'fish' as const, fishKey: 'k' };
    await cache.say('Hola.', settings, ok.fake);
    await cache.say('Hola.', settings, ok.fake);
    expect(ok.calls).toHaveLength(1);
    const bad = recorder(500);
    await cache.say('Chau.', settings, bad.fake);
    await cache.say('Chau.', settings, bad.fake);
    expect(bad.calls).toHaveLength(2);
  });
});
