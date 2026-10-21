import { type RefObject, useEffect, useRef, useState } from 'react';

import { useAppTheme } from '../effects/appTheme.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import { onCelebration } from './celebrate.js';
import { ClawdLife } from './clawdLife.js';
import {
  FollowBanner,
  GraphHint,
  GraphKeysHelp,
  GraphPanel,
  GraphToolbar,
  SlowNotice,
} from './GraphChrome.js';
import { GraphHoverCard } from './GraphHoverCard.js';
import { GraphPillActions } from './GraphPillActions.js';
import { onRevealOnGraph } from './graphReveal.js';
import { type GraphControls, useGraphCanvas } from './useGraphCanvas.js';
import { useGraphHover } from './useGraphHover.js';
import { useGraphKeys } from './useGraphKeys.js';
import { useGraphPill } from './useGraphPill.js';
import { useGraphSelection } from './useGraphSelection.js';

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
 * shows its quick card and fades everyone but its team; the amber pill of
 * what it asks grows into «Aprobar · Rechazar · Ver» (or «Hecho · Abrir PR»).
 * Opening an agent elsewhere (Alt+N, Ctrl+K, a terminal tab) selects it here
 * too, and "Seguir" keeps the camera on it. With the focus on the graph its
 * keys work ("?" lists them).
 */
export function GraphView({ views, actions }: { views: AgentView[]; actions: BoardActions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lifeRef = useRef(new ClawdLife());
  const sel = useGraphSelection(views, actions, lifeRef.current);
  const hover = useGraphHover(views);
  const pill = useGraphPill(views);
  const [followId, setFollowId] = useState<number | null>(null);
  const followed = views.find((v) => v.id === followId);
  const [slow, setSlow] = useState(false);
  const { current: workspace } = useWorkspaces();

  const controls = useGraphCanvas(canvasRef, {
    views,
    selected: sel.marked,
    calm: useCalmMode(),
    tint: useDayTint(),
    theme: useAppTheme(),
    life: lifeRef.current,
    cameraKey: workspace,
    onSelect: (picked, repeat) => {
      pill.close();
      sel.clicked(picked, repeat);
    },
    onPill: pill.onPill,
    onFollow: setFollowId,
    onSlow: () => setSlow(true),
    onHover: hover.setHover,
    onFrame: () => {
      hover.place(controls, rootRef.current);
      pill.place(controls, rootRef.current);
    },
  });

  /** Esc, from the graph: stop following, then shrink the pill, then let go
   *  of the selection. */
  const release = () => {
    if (followId !== null) controls.follow(null);
    else if (pill.isOpen()) pill.close();
    else sel.clear();
  };
  useGraphEvents({ rootRef, controls, release, opened: sel.opened, life: lifeRef.current });
  const keys = useGraphKeys({
    views,
    actions,
    controls,
    selected: sel.selected,
    selection: sel.selection,
    select: sel.select,
    following: followId,
    release,
  });

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      onPointerMove={pill.trackMouse}
      onPointerLeave={pill.forgetMouse}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 w-full h-full touch-none outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
        role="application"
        aria-roledescription="grafo"
        aria-label={`Grafo de agentes (apretá ? para ver los atajos): ${views.map((v) => `${v.name}, ${v.statusText}`).join('; ')}`}
        onKeyDown={keys.onKeyDown}
        onFocus={keys.onFocus}
      />
      {followed && <FollowBanner view={followed} onStop={() => controls.follow(null)} />}
      <GraphToolbar controls={controls} />
      {hover.facts && <GraphHoverCard facts={hover.facts} cardRef={hover.cardRef} />}
      {pill.view && (
        <GraphPillActions
          view={pill.view}
          actions={actions}
          boxRef={pill.boxRef}
          onOpen={() => {
            pill.close();
            sel.pick({ id: pill.view!.id });
          }}
          onClose={pill.done}
        />
      )}
      {slow && <SlowNotice />}
      {keys.hint && <GraphHint text={keys.hint} />}
      {keys.help && <GraphKeysHelp onClose={keys.closeHelp} />}
      {sel.selected && (
        <GraphPanel
          view={sel.selected}
          member={sel.selection?.member}
          actions={actions}
          following={followId === sel.selected.id}
          onFollow={(on) => controls.follow(on ? sel.selected!.id : null)}
          onClose={sel.clear}
        />
      )}
    </div>
  );
}

/** What reaches the graph from outside: an agent opened elsewhere, an Esc,
 *  a celebration. */
function useGraphEvents(input: {
  rootRef: RefObject<HTMLDivElement | null>;
  controls: GraphControls;
  release: () => void;
  opened: (agentId: number) => { id: number; member?: number };
  life: ClawdLife;
}) {
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => onCelebration((id) => latest.current.life.celebrate(id)), []);
  // Alt+N, Alt+1…9, Ctrl+K or a terminal tab: select it and bring it into view.
  useEffect(
    () =>
      onRevealOnGraph((agentId) => {
        const picked = latest.current.opened(agentId);
        latest.current.controls.focusOn(picked.id, picked.member);
      }),
    [],
  );
  useEffect(() => {
    // Only an Esc meant for the graph: not one typed in the terminal, the
    // chat or a dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const where = e.target as Node | null;
      const root = latest.current.rootRef.current;
      if (where !== document.body && !(where && root?.contains(where))) return;
      latest.current.release();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
