import { useEffect, useRef } from 'react';

import type { AgentView } from '../views/agentViews.js';
import { BUSY_KINDS, speechStep, type SpeechWatch } from './jarvisRules.js';
import { sayLatest } from './jarvisVoice.js';

/** Jarvis says its answer when a turn of its ends with one (speechStep). */
export function useJarvisSpeech(jarvis: AgentView | undefined): void {
  const busy = jarvis ? BUSY_KINDS.has(jarvis.kind) : false;
  const head = jarvis?.lastReplyHead;
  const id = jarvis?.id;
  const asksPermission = !!jarvis?.permission;
  const aloud = !!jarvis?.saysAloud;
  const watch = useRef<SpeechWatch>({ busy: false });

  useEffect(() => {
    const { next, speak } = speechStep(
      watch.current,
      { id, busy, head, asksPermission, aloud },
      Date.now(),
    );
    watch.current = next;
    if (speak && id !== undefined) sayLatest(id);
  }, [id, busy, head, asksPermission, aloud]);
}
