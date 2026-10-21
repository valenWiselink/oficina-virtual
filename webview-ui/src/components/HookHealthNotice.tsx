import { useState } from 'react';

import { useFocus } from '../focus/focusMode.js';
import { useHookHealth } from './hookHealthStore.js';
import { hookHealthText } from './hookHealthText.js';
import { Button } from './ui/Button.js';

/** After "Reinstalar", failures reported this soon are the old hooks finishing. */
const REINSTALL_GRACE_MS = 30_000;

/**
 * Top centre, when Claude Code's hooks stop reaching the office (the server
 * counts the failures the transcripts report): without it the office kept
 * showing old states and nobody knew. "Reinstalar avisos" writes them again
 * in the shape this version uses; closing it hides it until they fail again
 * after having recovered.
 */
export function HookHealthNotice({ onReinstall }: { onReinstall?: () => void }) {
  const health = useHookHealth();
  // Reinstalled: hidden until news newer than this (old hooks finishing first).
  const [quietUntil, setQuietUntil] = useState(0);
  // Closed: hidden for the rest of this bad stretch (the next one shows again).
  const [closedStretch, setClosedStretch] = useState<number | null>(null);
  const focus = useFocus();

  if (!health || health.since === closedStretch || health.at <= quietUntil) return null;
  const text = hookHealthText(health.status);
  return (
    <div
      role="alert"
      className={`absolute left-1/2 -translate-x-1/2 ${focus.active ? 'top-48' : 'top-10'} z-40 soft-panel border border-status-permission flex items-start gap-8 py-8 pl-12 pr-6 text-xs`}
      style={{ width: 'min(560px, calc(100% - 32px))' }}
    >
      <span className="material-symbols-sharp text-base text-status-permission" aria-hidden="true">
        sync_problem
      </span>
      <span className="flex flex-col gap-2 min-w-0 flex-1" title={text.detail}>
        <span className="text-text font-semibold">{text.title}</span>
        <span className="text-text-muted">{text.line}</span>
      </span>
      {onReinstall && (
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => {
            onReinstall();
            setQuietUntil(Date.now() + REINSTALL_GRACE_MS);
          }}
        >
          Reinstalar avisos
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0"
        title="Cerrar"
        aria-label="Cerrar"
        onClick={() => setClosedStretch(health.since)}
      >
        <span className="material-symbols-sharp text-sm" aria-hidden="true">
          close
        </span>
      </Button>
    </div>
  );
}
