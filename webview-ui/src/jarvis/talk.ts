import { useEffect } from 'react';

import { sendToAgent } from '../terminal/agentInput.js';
import { listenOnce } from './jarvisEars.js';
import { stopJarvis } from './jarvisVoice.js';
import { officeEars } from './officeEars.js';

/** What you say reaches Jarvis marked as spoken (its role reads «[Voz]»). */
export const VOICE_MARK = '[Voz]';

/**
 * Talk to Jarvis: it stops speaking (you talked over it) and listens until
 * you press again — a silence never cuts you off — then gets what you said
 * (written by the office when it can).
 */
export function talkToJarvis(jarvisId: number): void {
  stopJarvis();
  void listenOnce((text) => void sendToAgent(jarvisId, `${VOICE_MARK} ${text}`), officeEars);
}

/** Alt+J talks to Jarvis from anywhere in the office (again: finish and send). */
export function useTalkShortcut(jarvisId: number | undefined): void {
  useEffect(() => {
    if (jarvisId === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'j') return;
      e.preventDefault();
      talkToJarvis(jarvisId);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [jarvisId]);
}
