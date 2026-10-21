import { useState } from 'react';

import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import type { ClawdLife } from './clawdLife.js';
import { selectionOf } from './graphPick.js';
import type { GraphSelection } from './useGraphCanvas.js';

/** Who is picked on the graph (its panel) and what each way of picking does. */
export function useGraphSelection(views: AgentView[], actions: BoardActions, life: ClawdLife) {
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const selected = views.find((v) => v.id === selection?.id);

  /** Its panel, and its terminal like a click on the board. An outside agent
   *  only gets the panel (its "Traer" is right there). */
  const pick = (sel: GraphSelection) => {
    setSelection(sel);
    if (views.find((v) => v.id === sel.id)?.hasTerminal) actions.onSelect(sel.id);
  };

  /** A click on the graph (null: the background). */
  const clicked = (sel: GraphSelection | null, repeat: boolean) => {
    if (!sel) {
      setSelection(null);
      return;
    }
    // A member's click hops nobody (its lead stays put).
    if (sel.member === undefined) life.greet(sel.id, Date.now(), !repeat);
    // The second click of a double click only centres.
    if (!repeat) pick(sel);
  };

  /** Opened somewhere else (its terminal already shows): just select it. */
  const opened = (agentId: number): GraphSelection => {
    const sel = selectionOf(views, agentId);
    setSelection(sel);
    return sel;
  };

  return {
    selection,
    selected,
    /** What the canvas marks: only an agent that is on the graph. */
    marked: selected && selection ? selection : null,
    clear: () => setSelection(null),
    /** Select on the graph only (a key: its terminal opens with Enter). */
    select: (next: GraphSelection) => setSelection(next),
    pick,
    clicked,
    opened,
  };
}
