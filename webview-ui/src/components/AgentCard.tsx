import { type AgentKind, KIND_COLOR } from '../views/agentViews.js';
import type { CardVariant } from './cardBar.js';
import { CharacterMugShot } from './CharacterMugShot.js';

/** How a given agent's character looks, for the tab mug shot. */
export interface AgentAppearance {
  palette: number;
  hueShift: number;
}

/** The tab dot: the agent's state as the board shows it (same colour), or
 *  the drawer-owned "connection broken". */
export type TabStatus = AgentKind | 'disconnected';

const dotColor = (status: TabStatus): string =>
  status === 'disconnected' ? 'var(--color-status-error)' : KIND_COLOR[status];

const CARD_VARIANT: Record<CardVariant, string> = {
  default: 'bg-bg border-border hover:border-border-strong',
  focused: 'bg-active-bg border-transparent',
  active: 'bg-bg border-accent ring-2 ring-accent/30',
};

interface AgentCardProps {
  agentId: number;
  variant: CardVariant;
  appearance: AgentAppearance;
  status: TabStatus | null;
  /** When false the × is hidden. Mobile only shows it on the active terminal
   *  tab to keep a stray tap from killing an agent. */
  showClose?: boolean;
  /** Who it is, for the tooltip. */
  label?: string;
  onSelect: (agentId: number) => void;
  onClose: (agentId: number) => void;
}

/** One agent's tab: its mug shot with the state dot, and a close button on
 *  hover. The cards double as the terminal panel's tabs: clicking one selects
 *  that agent's pane. */
export function AgentCard({
  agentId,
  variant,
  appearance,
  status,
  showClose = true,
  label,
  onSelect,
  onClose,
}: AgentCardProps) {
  return (
    <div
      className={`group relative pointer-events-auto flex items-center justify-center w-52 h-52 rounded-xl cursor-pointer border shrink-0 transition-colors ${CARD_VARIANT[variant]}`}
      onClick={() => onSelect(agentId)}
      title={label ?? `Agente ${agentId}`}
    >
      <CharacterMugShot palette={appearance.palette} hueShift={appearance.hueShift} size={36} />
      {/* The state dot, ringed so it reads on any mug shot. */}
      {status && (
        <span
          className="absolute right-3 bottom-3 size-10 rounded-full ring-2 ring-bg"
          style={{ background: dotColor(status) }}
          title={status === 'disconnected' ? 'Terminal desconectada' : undefined}
        />
      )}
      {showClose && (
        <button
          type="button"
          onClick={(e) => {
            // Don't also select the tab we're about to remove.
            e.stopPropagation();
            onClose(agentId);
          }}
          title="Cerrar agente"
          aria-label="Cerrar agente"
          className="absolute right-1 top-1 size-16 rounded-full border border-border bg-bg text-text-muted hover:text-danger cursor-pointer flex items-center justify-center p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <span className="material-symbols-sharp text-xs" aria-hidden="true">
            close
          </span>
        </button>
      )}
    </div>
  );
}
