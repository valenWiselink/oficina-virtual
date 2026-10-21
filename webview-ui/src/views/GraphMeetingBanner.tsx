import { Button } from '../components/ui/Button.js';
import type { AgentView } from './agentViews.js';

/** A meeting in focus (double click in its hole, or its lead's menu): whose,
 *  and how to see everyone again. */
export function GraphMeetingBanner({ lead, onBack }: { lead: AgentView; onBack: () => void }) {
  return (
    <div
      role="status"
      className="absolute left-14 bottom-80 z-20 max-w-[calc(100%-28px)] soft-panel pl-10 pr-4 py-3 flex items-center gap-6 text-xs text-text"
    >
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        Junta de <strong className="font-semibold">{lead.name}</strong> · {lead.subagents.length}{' '}
        integrantes
      </span>
      <Button size="sm" variant="ghost" title="Esc" className="shrink-0" onClick={onBack}>
        Ver todos
      </Button>
    </div>
  );
}
