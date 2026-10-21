import { useRef } from 'react';

import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import {
  FollowBanner,
  GraphHint,
  GraphKeysHelp,
  GraphPanel,
  GraphToolbar,
  SlowNotice,
} from './GraphChrome.js';
import { GraphContextMenu } from './GraphContextMenu.js';
import { GraphFilterBar } from './GraphFilterBar.js';
import { GraphHoverCard } from './GraphHoverCard.js';
import { GraphMemberPanel } from './GraphMemberPanel.js';
import { GraphPillActions } from './GraphPillActions.js';
import { useGraphView } from './useGraphView.js';

type GraphState = ReturnType<typeof useGraphView>;

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
  const g = useGraphView(views, actions, canvasRef, rootRef);
  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      onPointerMove={g.pill.trackMouse}
      onPointerLeave={g.pill.forgetMouse}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="absolute inset-0 w-full h-full touch-none outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
        role="application"
        aria-roledescription="grafo"
        aria-label={`Grafo de agentes (apretá ? para ver los atajos): ${views.map((v) => `${v.name}, ${v.statusText}`).join('; ')}`}
        onKeyDown={g.keys.onKeyDown}
        onFocus={g.keys.onFocus}
      />
      <GraphOverlays g={g} views={views} actions={actions} />
      {g.menu.menu && (
        <GraphContextMenu
          menu={g.menu.menu}
          bounds={{ w: rootRef.current?.clientWidth ?? 0, h: rootRef.current?.clientHeight ?? 0 }}
          onPick={g.menu.run}
          onClose={g.menu.close}
        />
      )}
    </div>
  );
}

/** Everything drawn over the canvas: buttons, cards, the panel. */
function GraphOverlays({
  g,
  views,
  actions,
}: {
  g: GraphState;
  views: AgentView[];
  actions: BoardActions;
}) {
  const { sel, pill, controls, keys } = g;
  const followed = views.find((v) => v.id === g.followId);
  return (
    <>
      {followed && <FollowBanner view={followed} onStop={() => controls.follow(null)} />}
      <GraphToolbar controls={controls} />
      <GraphFilterBar views={views} filter={g.filter} onChange={g.setFilter} />
      {g.hover.facts && !g.menu.menu && (
        <GraphHoverCard facts={g.hover.facts} cardRef={g.hover.cardRef} />
      )}
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
      {g.slow && <SlowNotice />}
      {keys.hint && <GraphHint text={keys.hint} />}
      {keys.help && <GraphKeysHelp onClose={keys.closeHelp} />}
      <PickedPanel g={g} actions={actions} />
    </>
  );
}

/** The picked agent's panel, or a member's own (clicked in its meeting). */
function PickedPanel({ g, actions }: { g: GraphState; actions: BoardActions }) {
  const { sel, controls } = g;
  const lead = sel.selected;
  if (!lead) return null;
  const memberId = sel.selection?.member;
  const member = lead.subagents.find((s) => s.id === memberId);
  if (member) {
    return (
      <GraphMemberPanel
        lead={lead}
        member={member}
        onLead={() => {
          sel.pick({ id: lead.id });
          controls.focusOn(lead.id);
        }}
        onClose={sel.clear}
      />
    );
  }
  return (
    <GraphPanel
      view={lead}
      actions={actions}
      following={g.followId === lead.id}
      onFollow={(on) => controls.follow(on ? lead.id : null)}
      onClose={sel.clear}
    />
  );
}
