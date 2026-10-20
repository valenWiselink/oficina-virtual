import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { useAppTheme } from '../effects/appTheme.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import { type BoardActions, BoardCard } from './BoardCard.js';
import { onCelebration } from './celebrate.js';
import { ClawdLife } from './clawdLife.js';
import { clearPins, useHasPins } from './graphPins.js';
import { useGraphCanvas } from './useGraphCanvas.js';

/**
 * Agents float freely: collaborators attract (a lead and its subagents, two
 * subagents that passed a file), whoever needs you drifts toward "Vos" with
 * an arrow, and research pulls toward the library. Wheel zooms toward the
 * mouse, dragging the background pans, a double click centres an agent, and
 * "Encuadrar" shows everyone again. Drag an agent to put it somewhere (it
 * stays there; "Ordenar solo" lets them all settle by themselves again).
 * Clicking an agent opens its panel (same actions as the board) and its
 * terminal.
 */
export function GraphView({ views, actions }: { views: AgentView[]; actions: BoardActions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = views.find((v) => v.id === selectedId);
  const calm = useCalmMode();
  const tint = useDayTint();
  const theme = useAppTheme();
  const lifeRef = useRef(new ClawdLife());
  const { current: workspace } = useWorkspaces();
  const [slow, setSlow] = useState(false);
  const hasPins = useHasPins();

  const controls = useGraphCanvas(canvasRef, {
    views,
    selectedId: selected ? selected.id : null,
    calm,
    tint,
    theme,
    life: lifeRef.current,
    cameraKey: workspace,
    onSelect: (id) => {
      setSelectedId(id);
      if (id === null) return;
      lifeRef.current.greet(id, Date.now());
      // Its terminal follows the selection, like a click on the board. An
      // outside agent only gets the panel (its "Traer" is right there).
      if (views.find((v) => v.id === id)?.hasTerminal) actions.onSelect(id);
    },
    onSlow: () => setSlow(true),
  });

  useEffect(() => onCelebration((id) => lifeRef.current.celebrate(id)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
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
              onClick={() => setSelectedId(null)}
              title="Cerrar (Esc)"
              aria-label="Cerrar panel"
            >
              ×
            </Button>
          </div>
          <BoardCard view={selected} actions={actions} />
        </aside>
      )}
    </>
  );
}
