import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { useAppTheme } from '../effects/appTheme.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { useNow } from '../hooks/useNow.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { onCelebration } from './celebrate.js';
import { ClawdLife } from './clawdLife.js';
import { cardSpot, hoverFacts, type HoverTarget } from './graphHover.js';
import { GraphHoverCard } from './GraphHoverCard.js';
import { clearPins, useHasPins } from './graphPins.js';
import { type GraphControls, type GraphSelection, useGraphCanvas } from './useGraphCanvas.js';

/** Keep the quick card beside its agent (every frame: it moves). */
function placeCard(
  card: HTMLDivElement | null,
  hover: HoverTarget | null,
  controls: GraphControls,
  view: HTMLElement | null,
) {
  if (!card || !hover || !view) return;
  const node = controls.screenOf(hover.id, hover.member);
  if (!node) return;
  const spot = cardSpot(
    node,
    { w: card.offsetWidth, h: card.offsetHeight },
    { w: view.clientWidth, h: view.clientHeight },
  );
  card.style.transform = `translate(${Math.round(spot.left)}px, ${Math.round(spot.top)}px)`;
  card.style.visibility = 'visible';
}

/**
 * Agents float freely: collaborators attract (a lead and its subagents, two
 * subagents that passed a file), whoever needs you drifts toward "Vos" with
 * an arrow, and research pulls toward the library. The wheel zooms toward the
 * mouse (a touchpad scrolls and pinches), dragging the background pans, a
 * double click centres an agent, and "Encuadrar" shows everyone again. Drag
 * an agent to put it somewhere (it stays there; "Ordenar solo" lets them all
 * settle by themselves again). Clicking an agent opens its panel (same
 * actions as the board) and its terminal; clicking a member of a meeting
 * opens its lead's panel with that member marked. Resting the mouse on one
 * shows its quick card and fades everyone but its team.
 */
export function GraphView({ views, actions }: { views: AgentView[]; actions: BoardActions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const selected = views.find((v) => v.id === selection?.id);
  const calm = useCalmMode();
  const tint = useDayTint();
  const theme = useAppTheme();
  const lifeRef = useRef(new ClawdLife());
  const { current: workspace } = useWorkspaces();
  const [slow, setSlow] = useState(false);
  const hasPins = useHasPins();
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const cardRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const facts = hover ? hoverFacts(views, hover, now) : null;

  const controls = useGraphCanvas(canvasRef, {
    views,
    selected: selected && selection ? selection : null,
    calm,
    tint,
    theme,
    life: lifeRef.current,
    cameraKey: workspace,
    onSelect: (pick, repeat) => {
      if (!pick) {
        setSelection(null);
        return;
      }
      // A member's click hops nobody (its lead stays put).
      if (pick.member === undefined) lifeRef.current.greet(pick.id, Date.now(), !repeat);
      // The second click of a double click only centres.
      if (repeat) return;
      setSelection(pick);
      // Its terminal follows the selection, like a click on the board. An
      // outside agent only gets the panel (its "Traer" is right there).
      if (views.find((v) => v.id === pick.id)?.hasTerminal) actions.onSelect(pick.id);
    },
    onSlow: () => setSlow(true),
    onHover: setHover,
    onFrame: () => placeCard(cardRef.current, hoverRef.current, controls, rootRef.current),
  });

  useEffect(() => onCelebration((id) => lifeRef.current.celebrate(id)), []);
  useEffect(() => {
    // Only an Esc meant for the graph closes its panel: not one typed in the
    // terminal, the chat or a dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const where = e.target as Node | null;
      if (where === document.body || (where && rootRef.current?.contains(where))) {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 w-full h-full touch-none outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
        role="img"
        aria-label={`Grafo de agentes: ${views.map((v) => `${v.name}, ${v.statusText}`).join('; ')}`}
      />
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
      {facts && <GraphHoverCard facts={facts} cardRef={cardRef} />}
      {slow && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-80 z-10 soft-panel px-10 py-4 text-xs text-text-muted">
          Efectos reducidos: la PC va lenta
        </div>
      )}
      {selected && (
        <aside
          className="absolute top-14 right-14 z-20 w-[min(320px,calc(100%-28px))] soft-panel p-8 flex flex-col gap-8"
          aria-label={`Agente ${selected.name}`}
        >
          <div className="flex items-center justify-between gap-6 px-2">
            <Button size="sm" onClick={() => actions.onSelect(selected.id)}>
              {selected.hasTerminal ? 'Abrir su terminal' : 'Ver'}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelection(null)}
              title="Cerrar (Esc)"
              aria-label="Cerrar panel"
            >
              ×
            </Button>
          </div>
          <BoardCard view={selected} actions={actions} highlightMember={selection?.member} />
        </aside>
      )}
    </div>
  );
}
