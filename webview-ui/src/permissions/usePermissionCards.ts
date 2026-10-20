import { useCallback, useEffect, useRef, useState } from 'react';

import { TRANSPORT_STATE_CONNECTED } from '../../../core/src/constants.js';
import type { PermissionPending } from '../../../core/src/messages.js';
import { isSupervised } from '../identity/identityStore.js';
import { transport } from '../transport/index.js';
import { notifyWindows, requestNotificationPermissionOnFirstGesture } from './windowsNotify.js';

export interface PermissionCardsState {
  /** Answerable requests, oldest first. */
  cards: PermissionPending[];
  allow: (requestId: string) => void;
  deny: (requestId: string, message?: string) => void;
}

/**
 * Approval cards for held PermissionRequest hooks. The server is the source of
 * truth: a card exists exactly while the server holds the request, and every
 * way it ends (office answer, terminal answer, session moved on, expiry)
 * arrives as permissionResolved. On reconnect the list is cleared and the
 * server replays what is still held, so a restarted server can never leave a
 * card behind that nothing can answer.
 */
export function usePermissionCards(
  describeAgent: (card: PermissionPending) => string,
): PermissionCardsState {
  const [cards, setCards] = useState<PermissionPending[]>([]);
  const describeAgentRef = useRef(describeAgent);
  describeAgentRef.current = describeAgent;

  useEffect(() => requestNotificationPermissionOnFirstGesture(), []);

  useEffect(() => {
    const offMessage = transport.onMessage((msg) => {
      if (msg.type === 'permissionPending') {
        setCards((prev) =>
          prev.some((c) => c.requestId === msg.requestId) ? prev : [...prev, msg],
        );
        // A supervised agent's request reaches you through its supervisor.
        if (!isSupervised(msg.id)) {
          const who = describeAgentRef.current(msg);
          notifyWindows(`${who} necesita permiso`, msg.toolName, msg.requestId);
        }
      } else if (msg.type === 'permissionResolved') {
        setCards((prev) => prev.filter((c) => c.requestId !== msg.requestId));
      }
    });
    const offState = transport.onStateChange((state) => {
      // The replay after webviewReady refills what the server still holds.
      if (state !== TRANSPORT_STATE_CONNECTED) setCards([]);
    });
    return () => {
      offMessage();
      offState();
    };
  }, []);

  // Drop the card at once; the server's permissionResolved confirms it.
  const allow = useCallback((requestId: string) => {
    transport.send({ type: 'permissionDecision', requestId, behavior: 'allow' });
    setCards((prev) => prev.filter((c) => c.requestId !== requestId));
  }, []);
  const deny = useCallback((requestId: string, message?: string) => {
    transport.send({ type: 'permissionDecision', requestId, behavior: 'deny', message });
    setCards((prev) => prev.filter((c) => c.requestId !== requestId));
  }, []);

  // The tab title counts everything in "Te necesita" (useNeedsYouSignals),
  // not only these cards.
  return { cards, allow, deny };
}
