/**
 * The office's messages about Jarvis's voice: its settings (Ajustes) and
 * "say this" (the latest answer of Jarvis, or a test phrase). The audio goes
 * back only to the office that asked, as base64 mp3. When ElevenLabs cannot
 * (no key, no credit) Jarvis does not go mute: it speaks with Fish, and the
 * bar is told once.
 */

import type { AgentStateStore } from '../agentStateStore.js';
import { liveJarvis } from '../supervisors/jarvis.js';
import { SpeechCache, speechText, type Synthesized } from './speech.js';
import {
  changeVoiceSettings,
  readVoiceSettings,
  type VoiceSettings,
  voiceStatusMessage,
} from './voiceSettings.js';

type Send = (message: Record<string, unknown>) => void;

/**
 * ElevenLabs being down is said once, not on every sentence: the first
 * failure gets a notice for the bar; the next ones are quiet until it works
 * again.
 */
export class OutageNotice {
  private told = false;

  failed(reason: string, instead: string): string | undefined {
    if (this.told) return undefined;
    this.told = true;
    return `${reason}. ${instead}`;
  }

  worked(): void {
    this.told = false;
  }
}

const outage = new OutageNotice();

const cache = new SpeechCache();
const TEST_MAX_CHARS = 300;

/** Handles a voice message; false when `msg` is not one. */
export function handleVoiceMessage(
  msg: Record<string, unknown>,
  send: Send,
  store: AgentStateStore,
): boolean {
  switch (msg.type) {
    case 'requestJarvisVoice':
      send(voiceStatusMessage(readVoiceSettings()));
      return true;
    case 'setJarvisVoice': {
      const result = changeVoiceSettings(msg);
      send(
        result.ok
          ? voiceStatusMessage(result.settings)
          : voiceStatusMessage(readVoiceSettings(), result.reason),
      );
      return true;
    }
    case 'jarvisSay': {
      const key = typeof msg.key === 'string' ? msg.key.slice(0, 120) : '';
      void say(msg, store).then((r) =>
        send(
          r.ok
            ? {
                type: 'jarvisVoice',
                key,
                mime: r.mime,
                audio: r.audio.toString('base64'),
                text: r.text,
                notice: r.notice,
              }
            : { type: 'jarvisVoiceFailed', key, reason: r.reason, notice: r.notice },
        ),
      );
      return true;
    }
    default:
      return false;
  }
}

async function say(
  msg: Record<string, unknown>,
  store: AgentStateStore,
): Promise<
  | { ok: true; audio: Buffer; mime: string; text: string; notice?: string }
  | { ok: false; reason: string; notice?: string }
> {
  const settings = readVoiceSettings();
  if (settings.engine === 'off') return { ok: false, reason: 'La voz de Jarvis está apagada' };
  let raw: string | undefined;
  if (typeof msg.text === 'string') {
    raw = msg.text.slice(0, TEST_MAX_CHARS);
  } else {
    // Only Jarvis speaks: its latest answer, read from the office, not sent.
    const id = liveJarvis(store);
    raw = id === undefined || id !== msg.id ? undefined : store.get(id)?.lastReply;
  }
  const text = raw ? speechText(raw) : '';
  if (!text) return { ok: false, reason: 'No hay nada para decir' };
  // «Probar» in Ajustes tries the engine as it is: no Fish in its place.
  const tryingOut = typeof msg.text === 'string';
  const { made, notice } = tryingOut
    ? { made: await cache.say(text, settings) }
    : await sayOrFallBack(text, settings);
  return made.ok ? { ...made, text, notice } : { ...made, notice };
}

/** ElevenLabs first when it is the engine; Fish (Marcus) if it cannot. When
 *  Fish cannot either, ElevenLabs's reason is the one worth reading. */
async function sayOrFallBack(
  text: string,
  settings: VoiceSettings,
): Promise<{ made: Synthesized; notice?: string }> {
  if (settings.engine !== 'elevenlabs') return { made: await cache.say(text, settings) };
  const made = await cache.say(text, settings);
  if (made.ok) {
    outage.worked();
    return { made };
  }
  if (!settings.fishKey) return { made };
  const fish = await cache.say(text, { ...settings, engine: 'fish' });
  if (!fish.ok) return { made };
  return { made: fish, notice: outage.failed(made.reason, 'Mientras tanto hablo con Fish.') };
}
