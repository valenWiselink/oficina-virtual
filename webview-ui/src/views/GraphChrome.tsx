import { Button } from '../components/ui/Button.js';
import type { AgentView } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { clawdColor } from './clawdColor.js';
import { clearPins, useHasPins } from './graphPins.js';
import type { GraphControls } from './useGraphCanvas.js';

/** The graph's buttons: zoom, fit everyone, forget where you put them. */
export function GraphToolbar({ controls }: { controls: GraphControls }) {
  const hasPins = useHasPins();
  return (
    <div className="absolute right-14 bottom-36 z-10 flex gap-2 soft-panel p-3">
      <Button size="sm" variant="ghost" title="Alejar" onClick={() => controls.zoomBy(1 / 1.25)}>
        −
      </Button>
      <Button size="sm" variant="ghost" title="Acercar" onClick={() => controls.zoomBy(1.25)}>
        +
      </Button>
      <Button size="sm" variant="ghost" title="Ver a todos" onClick={controls.fitAll}>
        Encuadrar
      </Button>
      {hasPins && (
        <Button
          size="sm"
          variant="ghost"
          title="Olvidar dónde los pusiste: cada uno vuelve a acomodarse según lo que hace"
          onClick={clearPins}
        >
          Ordenar solo
        </Button>
      )}
    </div>
  );
}

/** The picked agent's panel: the board's card, its terminal, "Seguir". */
export function GraphPanel({
  view,
  member,
  actions,
  following,
  onFollow,
  onClose,
}: {
  view: AgentView;
  /** The member clicked in its meeting (its row stands out). */
  member?: number;
  actions: BoardActions;
  following: boolean;
  onFollow: (on: boolean) => void;
  onClose: () => void;
}) {
  return (
    <aside
      className="absolute top-14 right-14 z-20 w-[min(320px,calc(100%-28px))] soft-panel p-8 flex flex-col gap-8"
      aria-label={`Agente ${view.name}`}
    >
      <div className="flex items-center gap-6 px-2">
        <Button size="sm" onClick={() => actions.onSelect(view.id)}>
          {view.hasTerminal ? 'Abrir su terminal' : 'Ver'}
        </Button>
        <Button
          size="sm"
          variant={following ? 'active' : 'default'}
          title={following ? 'Dejar de seguirlo (Esc)' : 'Que la cámara lo acompañe'}
          onClick={() => onFollow(!following)}
        >
          {following ? 'Siguiendo' : 'Seguir'}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          onClick={onClose}
          title="Cerrar (Esc)"
          aria-label="Cerrar panel"
        >
          ×
        </Button>
      </div>
      <BoardCard view={view} actions={actions} highlightMember={member} />
    </aside>
  );
}

/** While the camera goes along with an agent: a thin frame in its colour and
 *  how to stop. */
export function FollowBanner({ view, onStop }: { view: AgentView; onStop: () => void }) {
  const color = clawdColor(view.palette, view.hueShift);
  return (
    <>
      <div
        className="absolute inset-0 z-10 pointer-events-none border-2"
        style={{ borderColor: color }}
      />
      <div
        role="status"
        className="absolute left-1/2 -translate-x-1/2 top-56 z-20 soft-panel pl-10 pr-4 py-3 flex items-center gap-6 text-xs text-text"
      >
        <span className="w-8 h-8 rounded-full shrink-0" style={{ background: color }} />
        <span>
          Siguiendo a <strong className="font-semibold">{view.name}</strong>
        </span>
        <Button size="sm" variant="ghost" title="Esc" onClick={onStop}>
          Dejar de seguir
        </Button>
      </div>
    </>
  );
}

export function SlowNotice() {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-80 z-10 soft-panel px-10 py-4 text-xs text-text-muted">
      Efectos reducidos: la PC va lenta
    </div>
  );
}
