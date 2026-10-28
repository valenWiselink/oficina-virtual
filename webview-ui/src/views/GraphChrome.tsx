import { Button } from '../components/ui/Button.js';
import type { AgentView } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { clawdColor } from './clawdColor.js';
import { GRAPH_KEYS_HELP, GRAPH_MOUSE_HELP } from './graphKeys.js';
import { clearPins, useHasPins } from './graphPins.js';
import type { GraphControls } from './useGraphCanvas.js';

/** The graph's buttons: zoom, fit everyone, forget where you put them. */
export function GraphToolbar({ controls }: { controls: GraphControls }) {
  const hasPins = useHasPins();
  return (
    // Left of Jarvis's bubble, which floats in the corner (JarvisBubble).
    <div className="absolute right-88 bottom-36 z-10 flex gap-2 soft-panel p-3">
      <Button
        size="sm"
        variant="ghost"
        title="Alejar (−)"
        onClick={() => controls.zoomBy(1 / 1.25)}
      >
        −
      </Button>
      <Button size="sm" variant="ghost" title="Acercar (+)" onClick={() => controls.zoomBy(1.25)}>
        +
      </Button>
      <Button size="sm" variant="ghost" title="Ver a todos (Shift+1)" onClick={controls.fitAll}>
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
          title={following ? 'Dejar de seguirlo (Esc)' : 'Que la cámara lo acompañe (F)'}
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
        className="absolute left-14 bottom-80 z-20 max-w-[calc(100%-28px)] soft-panel pl-10 pr-4 py-3 flex items-center gap-6 text-xs text-text"
      >
        <span className="w-8 h-8 rounded-full shrink-0" style={{ background: color }} />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          Siguiendo a <strong className="font-semibold">{view.name}</strong>
        </span>
        <Button size="sm" variant="ghost" title="Esc" className="shrink-0" onClick={onStop}>
          Dejar de seguir
        </Button>
      </div>
    </>
  );
}

export function SlowNotice() {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-168 z-10 soft-panel px-10 py-4 text-xs text-text-muted">
      Efectos reducidos: la PC va lenta
    </div>
  );
}

/** A key's short answer, at the bottom ("Aprobado…", "Elegí un agente…"). */
export function GraphHint({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="absolute left-1/2 -translate-x-1/2 bottom-124 z-20 soft-panel px-10 py-4 text-xs text-text"
    >
      {text}
    </div>
  );
}

function HelpList({ rows }: { rows: ReadonlyArray<[string, string]> }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-12 gap-y-4 text-xs">
      {rows.map(([keys, what]) => (
        <div key={keys} className="contents">
          <dt className="font-semibold text-text whitespace-nowrap">{keys}</dt>
          <dd className="m-0 text-text-2">{what}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "?": the graph's keys, and what the mouse does. */
export function GraphKeysHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Atajos del grafo"
      className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[75] w-[min(420px,calc(100%-28px))] soft-panel p-12 flex flex-col gap-8"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text">Atajos del grafo</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          title="Cerrar (Esc)"
          aria-label="Cerrar"
        >
          ×
        </Button>
      </div>
      <span className="text-2xs text-text-muted">
        Andan cuando el grafo tiene el foco: hacé clic en el fondo o llegá con Tab.
      </span>
      <HelpList rows={GRAPH_KEYS_HELP} />
      <span className="text-xs font-semibold text-text mt-4">Con el mouse</span>
      <HelpList rows={GRAPH_MOUSE_HELP} />
    </div>
  );
}
