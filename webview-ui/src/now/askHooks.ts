import { useState } from 'react';

import type { PendingAskEntry } from '../../../core/src/messages.js';
import { closePendingAsk } from '../pendingAsks/pendingAsksStore.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { JarvisLink } from './AskActions.js';
import { answerChoices, answerLine } from './nowRules.js';

/** Sí / No / Hecho that also tell Jarvis, written as if you typed it. */
export function useTellJarvis(jarvis: JarvisLink | undefined) {
  const [failed, setFailed] = useState(false);
  const tell = (text: string, then?: () => void) => {
    if (!jarvis?.writable) return;
    void sendToAgent(jarvis.id, text).then((ok) => {
      setFailed(!ok);
      if (ok) then?.();
    });
  };
  return { tell, failed, can: jarvis?.writable === true };
}

/**
 * What a swipe to the right does on an ask: its first answer (sent with its
 * id) or «Hecho». Never a merge: that is the button, with its confirmation.
 */
export function usePrimaryAction(
  ask: PendingAskEntry,
  jarvis: JarvisLink | undefined,
): { label: string; run: () => void } | undefined {
  const { tell, can } = useTellJarvis(jarvis);
  if (ask.mergeUrl) return undefined;
  const [first] = can ? answerChoices(ask) : [];
  if (first) return { label: first, run: () => tell(answerLine(ask, first)) };
  return { label: 'Hecho', run: () => closePendingAsk(ask.id) };
}
