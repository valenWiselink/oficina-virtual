import { TERMINAL_SIDEBAR_WIDTH_PX, TERMINAL_STRIP_HEIGHT_PX } from '../constants.js';
import type { AgentAppearance, TabStatus } from './AgentCard.js';
import { AgentCard } from './AgentCard.js';
import { cardVariant } from './cardBar.js';

interface AgentCardBarProps {
  /** Agents to show, in order. */
  agentIds: number[];
  /** The agent whose terminal pane is showing (standalone). Its card gets the
   *  accent border. */
  activeAgentId?: number | null;
  /** The agent whose character is selected in the office. Its card gets the
   *  active background; `activeAgentId` wins when both name the same agent. */
  focusedAgentId?: number | null;
  /** A column beside the office (panel at a side), or a row (top/bottom). */
  orientation?: 'vertical' | 'horizontal';
  getAppearance: (agentId: number) => AgentAppearance;
  /** Who each agent is, for its tab tooltip. */
  labelFor?: (agentId: number) => string | undefined;
  statusFor: (agentId: number) => TabStatus | null;
  onSelect: (agentId: number) => void;
  onClose: (agentId: number) => void;
}

/**
 * The strip of agent cards between the office and the terminal panel — one
 * mug shot and status dot per agent — shared by both desktop hosts. It takes
 * its own room in the layout (the board and the graph never sit under it).
 *
 * In standalone, TerminalDrawer owns the strip and the cards double as the
 * terminal panel's tabs. In VS Code the strip stands alone and lists every
 * agent in the office, external sessions included; a card click raises that
 * agent's editor terminal via focusAgent.
 */
export function AgentCardBar({
  agentIds,
  activeAgentId = null,
  focusedAgentId = null,
  orientation = 'vertical',
  getAppearance,
  labelFor,
  statusFor,
  onSelect,
  onClose,
}: AgentCardBarProps) {
  if (agentIds.length === 0) return null;
  const row = orientation === 'horizontal';

  return (
    <div
      className={`relative z-30 shrink-0 flex items-center gap-8 bg-transparent ${
        row ? 'w-full flex-row px-10 overflow-x-auto' : 'h-full flex-col pt-10 overflow-y-auto'
      }`}
      style={row ? { height: TERMINAL_STRIP_HEIGHT_PX } : { width: TERMINAL_SIDEBAR_WIDTH_PX }}
    >
      {/* The tour lights up the tabs themselves, not the whole (now
          transparent) strip. */}
      <div
        data-tour="pestanas"
        className={`flex items-center gap-8 ${row ? 'flex-row' : 'flex-col'}`}
      >
        {agentIds.map((agentId) => (
          <AgentCard
            key={agentId}
            agentId={agentId}
            variant={cardVariant(agentId, { activeId: activeAgentId, focusedId: focusedAgentId })}
            appearance={getAppearance(agentId)}
            status={statusFor(agentId)}
            label={labelFor?.(agentId)}
            onSelect={onSelect}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}
