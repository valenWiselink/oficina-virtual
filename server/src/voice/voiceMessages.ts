/**
 * The office's messages about Jarvis's voice: its settings (Ajustes) and
 * "say this" (the latest answer of Jarvis, or a test phrase). The audio goes
 * back only to the office that asked, as base64 mp3.
 */

import type { AgentStateStore } from '../agentStateStore.js';
import { liveJarvis } from '../supervisors/jarvis.js';
import { SpeechCache, speechText } from './speech.js';
import { changeVoiceSettings, readVoiceSettings, voiceStatusMessage } from './voiceSettings.js';

type Send = (message: Record<string, unknown>) => void;

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
              }
            : { type: 'jarvisVoiceFailed', key, reason: r.reason },
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
  { ok: true; audio: Buffer; mime: string; text: string } | { ok: false; reason: string }
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
  const made = await cache.say(text, settings);
  return made.ok ? { ...made, text } : made;
}
