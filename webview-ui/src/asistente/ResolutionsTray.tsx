import { useEffect, useState } from 'react';

import type { AskResolutionEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { mergePendingAsk, useMergeState } from '../pendingAsks/pendingAsksStore.js';
import { HoldButton } from './HoldButton.js';
import { undoAskResolution, useAskResolutions } from './resolutionsStore.js';

/** Seconds left before it applies, ticking. */
function useSecondsLeft(applyAt: number | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (applyAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [applyAt]);
  return applyAt === undefined ? undefined : Math.max(0, Math.ceil((applyAt - now) / 1000));
}

function Resolution({ item }: { item: AskResolutionEntry }) {
  const left = useSecondsLeft(item.applyAt);
  const merge = useMergeState(item.id);
  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4 border-b border-border last:border-b-0">
      <span className="font-mono text-2xs text-accent shrink-0">{item.id}</span>
      <span className="flex-1 min-w-[160px] text-xs text-text truncate" title={item.text}>
        {item.text}
      </span>
      {item.hold ? (
        merge?.busy ? (
          <span className="text-2xs text-text-muted">Mergeando…</span>
        ) : (
          <HoldButton
            label={`Mantené para ${item.label.toLowerCase()}`}
            onHeld={() => mergePendingAsk(item.id)}
          />
        )
      ) : (
        <span className="text-xs font-semibold text-status-success">
          {item.label}
          {left !== undefined && (
            <span className="font-normal text-text-muted"> · en {left} s</span>
          )}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={() => undoAskResolution(item.key)}>
        Deshacer
      </Button>
      {merge && !merge.busy && !merge.ok && (
        <span className="w-full text-2xs text-status-error">{merge.message}</span>
      )}
    </li>
  );
}

/**
 * «Lo tomé así»: how Jarvis read what you said about several asks at once,
 * each with «Deshacer» for a few seconds before it applies. A merge waits
 * for you to hold its button down: never by voice.
 */
export function ResolutionsTray() {
  const items = useAskResolutions();
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Lo que Jarvis entendió"
      className="mx-10 mb-6 rounded-lg border border-status-success bg-bg px-10 py-6"
    >
      <h3 className="m-0 text-2xs font-bold tracking-[0.12em] text-status-success">LO TOMÉ ASÍ</h3>
      <ul className="m-0 p-0 list-none">
        {items.map((item) => (
          <Resolution key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}
