import { useEffect, useRef } from 'react';

import type { AgentView } from '../views/agentViews.js';
import { BUSY_KINDS, shouldSpeak } from './jarvisRules.js';
import { sayLatest } from './jarvisVoice.js';

export function useJarvisSpeech(jarvis: AgentView | undefined): void {
  const busy = jarvis ? BUSY_KINDS.has(jarvis.kind) : false;
  const head = jarvis?.lastReplyHead;
  const id = jarvis?.id;
  const asksPermission = !!jarvis?.permission;
  const before = useRef<{ id?: number; busy: boolean; headAtStart?: string }>({ busy: false });

  useEffect(() => {
    const was = before.current;
    if (shouldSpeak(was, { id, busy, head, asksPermission }) && id !== undefined) sayLatest(id);
    before.current = {
      id,
      busy,
      // The answer it had when this turn started: a turn that ends without a
      // new one has nothing new to say.
      headAtStart: busy ? (was.busy && was.id === id ? was.headAtStart : head) : head,
    };
  }, [id, busy, head, asksPermission]);
}
