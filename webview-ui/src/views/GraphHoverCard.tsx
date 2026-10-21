import type { RefObject } from 'react';

import { KIND_COLOR } from './agentViews.js';
import { clawdColor } from './clawdColor.js';
import type { HoverFacts } from './graphHover.js';

const STATUS_TONE: Partial<Record<HoverFacts['kind'], string>> = {
  needs: 'text-status-permission-text font-medium',
  done: 'text-status-success',
};

/**
 * The quick card beside the agent (or member) the mouse rests on: what its
 * label clips, whole. Information, not a menu: it never takes the mouse
 * (clicks go through to the graph). GraphView moves it every frame
 * (`cardRef`), and keeps it hidden until it knows where.
 */
export function GraphHoverCard({
  facts,
  cardRef,
}: {
  facts: HoverFacts;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const color = clawdColor(facts.palette, facts.hueShift);
  const counts = [facts.tasks, facts.context].filter(Boolean).join(' · ');
  return (
    <div
      ref={cardRef}
      role="tooltip"
      className="absolute left-0 top-0 z-[70] w-[260px] soft-panel px-10 py-8 flex flex-col gap-3 pointer-events-none"
      style={{ visibility: 'hidden' }}
    >
      <span className="flex items-start gap-6 text-sm font-semibold text-text break-words">
        <span className="w-8 h-8 mt-5 rounded-full shrink-0" style={{ background: color }} />
        {facts.name}
      </span>
      {facts.lead && <span className="text-2xs text-text-muted">{facts.lead}</span>}
      <span
        className={`text-xs flex items-start gap-5 break-words ${STATUS_TONE[facts.kind] ?? 'text-text-2'}`}
      >
        <span
          className="w-7 h-7 mt-4 rounded-full shrink-0"
          style={{ background: KIND_COLOR[facts.kind] }}
        />
        {facts.status}
      </span>
      {facts.waited && (
        <span className="text-2xs font-semibold text-status-permission-text">{facts.waited}</span>
      )}
      {facts.meta && <span className="text-2xs text-text-muted break-words">{facts.meta}</span>}
      {counts && <span className="text-2xs text-text-muted">{counts}</span>}
      {facts.reply && (
        <span className="text-2xs text-text-2 line-clamp-2 break-words">{facts.reply}</span>
      )}
      {facts.tools && facts.tools.length > 0 && (
        <span className="flex flex-col gap-1 text-2xs text-text-2">
          <span className="text-text-muted">Lo último que hizo</span>
          {facts.tools.map((tool, i) => (
            <span key={i} className="overflow-hidden text-ellipsis whitespace-nowrap">
              {tool}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
