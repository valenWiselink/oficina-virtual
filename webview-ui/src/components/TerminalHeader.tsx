import type { PaneMode } from '../chat/chatMode.js';
import { CLAWD_BODY_COLORS } from '../constants.js';
import { useNow } from '../hooks/useNow.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { type AgentView, KIND_COLOR, waitedFor } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { Button } from './ui/Button.js';

/** Height of a terminal's header strip, in px. */
export const TERMINAL_HEADER_PX = 36;

interface TerminalHeaderProps {
  view: AgentView | undefined;
  agentId: number;
  actions: BoardActions;
  /** This pane is the one pinned beside the active one. */
  pinned: boolean;
  onTogglePin: () => void;
  onSearch?: () => void;
  /** Only on the first header: close the whole panel. */
  onClosePanel?: () => void;
  closeGlyph?: string;
  /** Chat or raw terminal for this slot. */
  mode: PaneMode;
  onModeChange: (mode: PaneMode) => void;
}

/**
 * Who this terminal belongs to, at a glance: their colour, name, branch and
 * state (same colour as everywhere else), how full their context is, and what
 * you can do — answer a permission, mark a "te toca" done, open its PR, pin
 * it beside another, pass its answer on.
 */
export function TerminalHeader({
  view,
  agentId,
  actions,
  pinned,
  onTogglePin,
  onSearch,
  onClosePanel,
  closeGlyph = '>',
  mode,
  onModeChange,
}: TerminalHeaderProps) {
  const now = useNow();
  const color = view ? CLAWD_BODY_COLORS[view.palette % CLAWD_BODY_COLORS.length] : undefined;
  return (
    <div
      className="flex items-center gap-6 px-8 bg-bg border-b border-border min-w-0"
      style={{ height: TERMINAL_HEADER_PX }}
    >
      <span className="w-3 self-stretch my-6 rounded-full shrink-0" style={{ background: color }} />
      <span
        className="w-7 h-7 rounded-full shrink-0"
        style={{ background: view ? KIND_COLOR[view.kind] : undefined }}
      />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span className="text-xs font-semibold text-text truncate">
          {view?.name ?? `Agente ${agentId}`}
          {view?.branch && <span className="font-normal text-text-muted"> · {view.branch}</span>}
        </span>
        <span className="text-2xs text-text-muted truncate">
          {view?.statusText}
          {view?.waitingSince !== undefined && ` · te espera ${waitedFor(view.waitingSince, now)}`}
        </span>
      </div>
      {view?.contextPct !== undefined && <ContextMeter pct={view.contextPct} />}
      <HeaderActions view={view} actions={actions} />
      <div className="flex rounded-lg bg-bg-thumb p-1 shrink-0" role="group" aria-label="Ver como">
        {(['chat', 'terminal'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={`border-0 rounded-md px-6 py-1 text-2xs font-medium cursor-pointer ${
              mode === m
                ? 'bg-bg text-text shadow-soft'
                : 'bg-transparent text-text-muted hover:text-text'
            }`}
          >
            {m === 'chat' ? 'Chat' : 'Terminal'}
          </button>
        ))}
      </div>
      {onSearch && <IconButton icon="search" title="Buscar (Ctrl+Shift+F)" onClick={onSearch} />}
      <IconButton
        icon="push_pin"
        title={pinned ? 'Desfijar' : 'Fijar al lado del que elijas'}
        active={pinned}
        onClick={onTogglePin}
      />
      {actions.onHandOff && (
        <IconButton
          icon="forward"
          title="Pasar su última respuesta a otro agente"
          onClick={() => actions.onHandOff!(agentId)}
        />
      )}
      {onClosePanel && (
        <Button variant="ghost" size="icon" onClick={onClosePanel} title="Cerrar terminal">
          {closeGlyph}
        </Button>
      )}
    </div>
  );
}

function HeaderActions({ view, actions }: { view?: AgentView; actions: BoardActions }) {
  if (view?.permission && actions.onAllow && actions.onDeny) {
    return (
      <ApproveButtons
        permission={view.permission}
        onAllow={actions.onAllow}
        onDeny={actions.onDeny}
      />
    );
  }
  return (
    <>
      {view?.prUrl && (
        <Button size="sm" onClick={() => window.open(view.prUrl, '_blank', 'noopener')}>
          Abrir PR
        </Button>
      )}
      {view?.yourTurnId && actions.onYourTurnDone && (
        <Button
          size="sm"
          variant="accent"
          onClick={() => actions.onYourTurnDone!(view.yourTurnId!)}
        >
          Hecho
        </Button>
      )}
    </>
  );
}

/** Context used: grey, red only from 90% (amber would claim it needs you). */
function ContextMeter({ pct }: { pct: number }) {
  return (
    <span
      className="w-40 h-4 rounded-full bg-bg-thumb overflow-hidden shrink-0"
      title={`Contexto usado: ${pct}%`}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.min(100, pct)}%`,
          background: pct >= 90 ? 'var(--color-danger)' : 'var(--color-text-muted)',
        }}
      />
    </span>
  );
}

function IconButton({
  icon,
  title,
  onClick,
  active = false,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      variant={active ? 'active' : 'ghost'}
      size="icon"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="material-symbols-sharp text-sm" aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
}
