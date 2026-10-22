/**
 * Jarvis's words as audio: what of an answer is said aloud (speechText) and
 * the engines that say it (Fish Audio's free model, or ElevenLabs). The
 * engines are plain HTTP calls; their base URLs can be pointed elsewhere for
 * tests (OFICINA_FISH_URL, OFICINA_ELEVEN_URL).
 */

import { createHash } from 'crypto';

import {
  ELEVEN_DEFAULT_VOICE,
  ELEVEN_MODEL,
  FISH_MODEL,
  type VoiceSettings,
} from './voiceSettings.js';

/** The longest stretch said aloud: Jarvis answers in a sentence or two, and
 *  anything longer is on screen anyway. */
export const SPOKEN_MAX_CHARS = 500;

/**
 * What of an answer is said aloud: no code, tables, links, paths or markdown,
 * and no "Te toca:" label; cut at a sentence end when it runs long.
 */
export function speechText(raw: string, max = SPOKEN_MAX_CHARS): string {
  let t = raw.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/^\s*\|.*\|\s*$/gm, ' ');
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, ' ');
  // Inline code: a path or a file name is noise out loud; a word is kept.
  t = t.replace(/`([^`]*)`/g, (_m, code: string) => (/[\\/]|\.\w{1,5}$/.test(code) ? ' ' : code));
  t = t.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '');
  t = t.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1');
  t = t.replace(/^\s*te toca:\s*/gim, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

export type Synthesized = { ok: true; audio: Buffer; mime: string } | { ok: false; reason: string };
type Fetch = typeof fetch;

const FISH_URL = () => process.env.OFICINA_FISH_URL ?? 'https://api.fish.audio';
const ELEVEN_URL = () => process.env.OFICINA_ELEVEN_URL ?? 'https://api.elevenlabs.io';

/** Why the service said no, in words for Valentín. */
function refusal(service: string, status: number): string {
  if (status === 401 || status === 403) return `${service} no acepta la clave: revisala en Ajustes`;
  if (status === 402) return `${service} dice que no hay crédito`;
  if (status === 429) return `${service} está limitando los pedidos: probá en un rato`;
  if (status === 404) return `${service} no encuentra esa voz`;
  return `${service} respondió ${status}`;
}

async function call(
  service: string,
  doFetch: Fetch,
  url: string,
  init: RequestInit,
): Promise<Synthesized> {
  try {
    const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, reason: refusal(service, res.status) };
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) return { ok: false, reason: `${service} no devolvió audio` };
    return { ok: true, audio, mime: 'audio/mpeg' };
  } catch (err) {
    return {
      ok: false,
      reason: `No llego a ${service}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Say `text` with the engine in the settings. */
export function synthesize(
  text: string,
  settings: VoiceSettings,
  doFetch: Fetch = fetch,
): Promise<Synthesized> {
  if (settings.engine === 'fish') {
    if (!settings.fishKey)
      return Promise.resolve({
        ok: false,
        reason: 'Falta la clave de Fish Audio (Ajustes → Voz de Jarvis)',
      });
    return call('Fish Audio', doFetch, `${FISH_URL()}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.fishKey}`,
        'Content-Type': 'application/json',
        model: FISH_MODEL,
      },
      body: JSON.stringify({
        text,
        format: 'mp3',
        latency: 'balanced',
        ...(settings.fishVoice ? { reference_id: settings.fishVoice } : {}),
      }),
    });
  }
  if (settings.engine === 'elevenlabs') {
    if (!settings.elevenKey)
      return Promise.resolve({
        ok: false,
        reason: 'Falta la clave de ElevenLabs (Ajustes → Voz de Jarvis)',
      });
    const voice = settings.elevenVoice ?? ELEVEN_DEFAULT_VOICE;
    return call(
      'ElevenLabs',
      doFetch,
      `${ELEVEN_URL()}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': settings.elevenKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: settings.elevenModel ?? ELEVEN_MODEL }),
      },
    );
  }
  return Promise.resolve({ ok: false, reason: 'La voz de Jarvis está apagada' });
}

/**
 * The same words are said once: a second office window (or a second ask)
 * gets the audio already made instead of paying for it again.
 */
export class SpeechCache {
  private readonly made = new Map<string, Promise<Synthesized>>();

  constructor(private readonly max = 20) {}

  say(text: string, settings: VoiceSettings, doFetch?: Fetch): Promise<Synthesized> {
    const key = createHash('sha256')
      .update(
        `${settings.engine}|${settings.fishVoice ?? ''}|${settings.elevenVoice ?? ''}|${text}`,
      )
      .digest('hex');
    const known = this.made.get(key);
    if (known) return known;
    const made = synthesize(text, settings, doFetch).then((r) => {
      if (!r.ok) this.made.delete(key);
      return r;
    });
    this.made.set(key, made);
    while (this.made.size > this.max) this.made.delete(this.made.keys().next().value as string);
    return made;
  }
}
