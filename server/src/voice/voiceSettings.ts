/**
 * Jarvis's voice settings (Ajustes → Voz de Jarvis): which engine speaks for
 * it and with which voice. The API keys stay here, on this machine, in
 * `~/.pixel-agents/jarvis/voz.json`: the browser only learns whether one is
 * saved, never the key itself.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';

export type VoiceEngine = 'off' | 'fish' | 'elevenlabs';

export interface VoiceSettings {
  engine: VoiceEngine;
  fishKey?: string;
  /** A Fish Audio voice (reference_id); empty = its default voice. */
  fishVoice?: string;
  elevenKey?: string;
  elevenVoice?: string;
  elevenModel?: string;
}

/** Fish Audio's free model (same voice model as the paid one, free under
 *  its fair use policy through 2026-11-30). */
export const FISH_MODEL = 's2.1-pro-free';
/** ElevenLabs' fastest model that speaks Spanish. */
export const ELEVEN_MODEL = 'eleven_flash_v2_5';
/** Diego (Argentine, conversational): a voice any account can use. */
export const ELEVEN_DEFAULT_VOICE = '5da4nOCHLuswM3TyAUSo';

/** Where it lives (resolved on use: tests move the home directory). */
const settingsFile = () => path.join(os.homedir(), SERVER_JSON_DIR, 'jarvis', 'voz.json');
const ENGINES: readonly VoiceEngine[] = ['off', 'fish', 'elevenlabs'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const str = (v: unknown, max = 200) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

export function readVoiceSettings(file = settingsFile()): VoiceSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    return {
      engine: ENGINES.includes(raw.engine as VoiceEngine) ? (raw.engine as VoiceEngine) : 'off',
      fishKey: str(raw.fishKey),
      fishVoice: str(raw.fishVoice, 64),
      elevenKey: str(raw.elevenKey),
      elevenVoice: str(raw.elevenVoice, 64),
      elevenModel: str(raw.elevenModel, 64),
    };
  } catch {
    return { engine: 'off' };
  }
}

/**
 * Apply what the Ajustes form sent. A key or voice left out stays as it was;
 * an empty string clears it. Returns the new settings, or why not.
 */
export function changeVoiceSettings(
  msg: Record<string, unknown>,
  file = settingsFile(),
): { ok: true; settings: VoiceSettings } | { ok: false; reason: string } {
  const next: VoiceSettings = { ...readVoiceSettings(file) };
  if (msg.engine !== undefined) {
    if (!ENGINES.includes(msg.engine as VoiceEngine))
      return { ok: false, reason: 'Motor de voz desconocido' };
    next.engine = msg.engine as VoiceEngine;
  }
  for (const field of ['fishKey', 'elevenKey'] as const) {
    if (typeof msg[field] === 'string') next[field] = str(msg[field]);
  }
  for (const field of ['fishVoice', 'elevenVoice', 'elevenModel'] as const) {
    if (typeof msg[field] !== 'string') continue;
    const value = str(msg[field], 64);
    if (value && !ID_PATTERN.test(value))
      return { ok: false, reason: 'Ese id de voz no es válido' };
    next[field] = value;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
  } catch (err) {
    return { ok: false, reason: `No pude guardar la voz: ${String(err)}` };
  }
  return { ok: true, settings: next };
}

/** What the browser may know: no keys, only whether there is one. */
export function voiceStatusMessage(
  settings: VoiceSettings,
  error?: string,
): Record<string, unknown> {
  return {
    type: 'jarvisVoiceStatus',
    engine: settings.engine,
    fishKeySet: !!settings.fishKey,
    fishVoice: settings.fishVoice,
    elevenKeySet: !!settings.elevenKey,
    elevenVoice: settings.elevenVoice,
    elevenModel: settings.elevenModel,
    error,
  };
}
