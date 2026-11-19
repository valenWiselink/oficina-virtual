import type { PendingAskEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { reopenPendingAsk } from './pendingAsksStore.js';
import { askWhen, recentAutoClosed } from './pendingAsksView.js';

/**
 * «Se cerraron solos»: what the office closed without a click (his answer,
 * the author's next step, the reviewer), each with why and «Deshacer», which
 * brings it back to «Te toca».
 */
export function AutoClosedAsks({
  closed,
  now,
}: {
  closed: readonly PendingAskEntry[];
  now: number;
}) {
  const recent = recentAutoClosed(closed, now);
  if (recent.length === 0) return null;
  return (
    <section aria-label="Se cerraron solos" className="flex flex-col gap-2">
      <h3 className="m-0 text-2xs font-mono uppercase tracking-wider text-text-muted">
        Se cerraron solos
      </h3>
      <ul className="m-0 p-0 list-none">
        {recent.map((ask) => (
          <li
            key={ask.id}
            className="flex items-start gap-8 py-5 border-b border-border last:border-b-0"
          >
            <span className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-xs text-text-2 truncate" title={ask.text}>
                {ask.text}
              </span>
              <span className="text-2xs text-text-muted">
                <span className="font-mono text-accent">{ask.id}</span> ·{' '}
                <span className="text-status-success">{ask.closedHow ?? 'Cerrado'}</span>
                {ask.closedAt !== undefined ? ` · ${askWhen(ask.closedAt, now)}` : ''}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => reopenPendingAsk(ask.id)}>
              Deshacer
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
