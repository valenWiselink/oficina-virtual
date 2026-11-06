import { useEffect } from 'react';

import type { AgentView } from '../views/agentViews.js';
import { clock, MAX_DICTATION_MS } from './dictation.js';
import { heardNoteMs, heardNoteOf, useFleetingNote } from './heardNote.js';
import { type EarsState, useJarvisEars } from './jarvisEars.js';
import { useJarvisNotice } from './jarvisNotice.js';
import { jarvisMood } from './jarvisRules.js';
import { requestJarvisVoice, useJarvisVoice } from './jarvisVoice.js';

/** What its ears are doing, in words (undefined: nothing to say). What it
 *  heard is not here: that is a fleeting note (heardNote.ts). */
function earsLineOf(ears: EarsState): string | undefined {
  if (ears.phase === 'listening')
    return `Te escucho, tomate tu tiempo: no corto por silencio. Cuando termines, apretá de nuevo el micrófono o Alt+J y se lo paso (se corta solo a los ${clock(MAX_DICTATION_MS)}).`;
  if (ears.phase === 'transcribing') return 'Escribiendo lo que dijiste…';
  if (ears.phase === 'preparing')
    return `Preparando el oído de Jarvis${ears.percent !== undefined ? ` (${ears.percent} %)` : ''}: la primera vez baja el modelo de voz.`;
  if (ears.error) return ears.error;
  return undefined;
}

/** How Jarvis is right now, as both its bubble and the Control view show it. */
export function useJarvisChatState(jarvis: AgentView | undefined, open: boolean) {
  const voice = useJarvisVoice();
  const ears = useJarvisEars();
  const voiceNotice = useJarvisNotice();
  // Which engine speaks is no news while you muted it (it shows if you unmute).
  const notice = voice.muted ? undefined : voiceNotice;
  useEffect(() => requestJarvisVoice(), []);
  const note = useFleetingNote(
    ears.heard ? ears.heardAt : undefined,
    heardNoteMs(ears.heard ?? ''),
  );
  return {
    voice,
    ears,
    notice,
    earsLine: earsLineOf(ears),
    note,
    noteText: note.phase === 'gone' ? undefined : heardNoteOf(ears, open),
    mood: jarvis ? (voice.speaking ? 'busy' : jarvisMood(jarvis)) : ('away' as const),
    listening: ears.phase === 'listening',
    needsYou: !!jarvis && (jarvis.kind === 'needs' || !!jarvis.permission),
    speaks: !!voice.status && voice.status.engine !== 'off',
    turnId: jarvis?.kind === 'needs' ? jarvis.yourTurnId : undefined,
  };
}

export type JarvisChatState = ReturnType<typeof useJarvisChatState>;
