import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentStateStore } from '../src/agentStateStore.js';
import {
  audioCtx,
  GpuEars,
  gpuEars,
  hearingDir,
  hearingPrompt,
  wav,
} from '../src/voice/gpuEars.js';
import { handleVoiceMessage } from '../src/voice/voiceMessages.js';

const seconds = (s: number) => Buffer.alloc(Math.round(s * 16_000) * 2);

describe('what whisper.cpp is told it will hear', () => {
  it('names Jarvis and the agents, once, and the usual short answers', () => {
    const prompt = hearingPrompt(['Coral', 'Coral', undefined, 'Lango<stino>', '']);
    expect(prompt).toBe('Jarvis, Coral, Lango stino. Listo, dale, ya probé, ya está.');
  });
});

describe('the audio it gets', () => {
  it('is a 16 kHz mono WAV', () => {
    const file = wav(Buffer.from([1, 2, 3, 4]));
    expect(file.subarray(0, 4).toString()).toBe('RIFF');
    expect(file.subarray(8, 12).toString()).toBe('WAVE');
    expect(file.readUInt32LE(24)).toBe(16_000);
    expect(file.readUInt16LE(22)).toBe(1);
    expect(file.readUInt32LE(40)).toBe(4);
    expect(file.length).toBe(48);
  });

  it('looks at 15 s for a short phrase and at the whole window for a long one', () => {
    expect(audioCtx(seconds(4))).toBe(768);
    expect(audioCtx(seconds(13))).toBe(768);
    expect(audioCtx(seconds(18))).toBe(0);
  });
});

describe('where it lives', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('can be moved with OFICINA_OIDO_DIR', () => {
    vi.stubEnv('OFICINA_OIDO_DIR', 'F:\\oido-prueba');
    expect(hearingDir()).toBe('F:\\oido-prueba');
  });

  it('never on the system drive when another has room', () => {
    vi.stubEnv('OFICINA_OIDO_DIR', '');
    delete process.env.OFICINA_OIDO_DIR;
    const dir = hearingDir();
    const system = (process.env.SystemDrive ?? 'C:').toUpperCase();
    if (/^[A-Z]:\\/.test(dir) && !dir.includes('.pixel-agents'))
      expect(dir.slice(0, 2).toUpperCase()).not.toBe(system);
  });
});

describe('when it is not there, the page writes it', () => {
  const store = {
    values: () => [{ nickname: 'Coral' }][Symbol.iterator](),
  } as unknown as AgentStateStore;
  const ask = (msg: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve) => handleVoiceMessage(msg, resolve, store));

  afterEach(() => vi.restoreAllMocks());

  it('answers «local» while it is unavailable, and asks it to get ready', async () => {
    const prepare = vi.spyOn(GpuEars.prototype, 'prepare').mockResolvedValue();
    gpuEars.status = 'off';
    const audio = seconds(1).toString('base64');
    expect(await ask({ type: 'jarvisHear', id: 3, audio })).toEqual({
      type: 'jarvisHeard',
      id: 3,
      local: true,
    });
    expect(prepare).toHaveBeenCalled();
  });

  it('passes the text when it is ready, with the nicknames in the prompt', async () => {
    gpuEars.status = 'ready';
    const fake = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get('prompt')).toBe('Jarvis, Coral. Listo, dale, ya probé, ya está.');
      expect(form.get('language')).toBe('es');
      expect(form.get('audio_ctx')).toBe('768');
      return new Response(JSON.stringify({ text: ' Dale, Coral.\n' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fake);
    const audio = seconds(2).toString('base64');
    expect(await ask({ type: 'jarvisHear', id: 4, audio })).toEqual({
      type: 'jarvisHeard',
      id: 4,
      text: 'Dale, Coral.',
    });
    vi.unstubAllGlobals();
    gpuEars.status = 'off';
  });

  it('hands it back when whisper.cpp fails mid-way, or the audio is too long', async () => {
    gpuEars.status = 'ready';
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    const audio = seconds(2).toString('base64');
    expect(await ask({ type: 'jarvisHear', id: 5, audio })).toMatchObject({ local: true });
    const long = seconds(40).toString('base64');
    expect(await ask({ type: 'jarvisHear', id: 6, audio: long })).toMatchObject({ local: true });
    vi.unstubAllGlobals();
    gpuEars.status = 'off';
  });
});
