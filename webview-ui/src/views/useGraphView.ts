import { type RefObject, useEffect, useRef, useState } from 'react';

import { useAppTheme } from '../effects/appTheme.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useDayTint } from '../effects/dayTint.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import type { ClawdLife } from './clawdLife.js';
import { filterFocus, type GraphFilter } from './graphFilter.js';
import { onRevealOnGraph } from './graphReveal.js';
import { dayKey, officeLife, takeDailyWave } from './officeLife.js';
import { type GraphControls, useGraphCanvas } from './useGraphCanvas.js';
import { useGraphHover } from './useGraphHover.js';
import { useGraphKeys } from './useGraphKeys.js';
import { useGraphMenu } from './useGraphMenu.js';
import { useGraphPill } from './useGraphPill.js';
import { useGraphSelection } from './useGraphSelection.js';

/**
 * Everything the graph view holds: the canvas loop and the state around it
 * (selection, quick card, grown pill, who the camera follows, keys).
 */
export function useGraphView(
  views: AgentView[],
  actions: BoardActions,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rootRef: RefObject<HTMLDivElement | null>,
) {
  const lifeRef = useRef(officeLife);
  const sel = useGraphSelection(views, actions, lifeRef.current);
  const hover = useGraphHover(views);
  const pill = useGraphPill(views);
  const [followId, setFollowId] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [filter, setFilter] = useState<GraphFilter>('all');
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const look = { calm: useCalmMode(), tint: useDayTint(), theme: useAppTheme() };
  const controls = useGraphCanvas(canvasRef, {
    ...look,
    views,
    selected: sel.marked,
    life: lifeRef.current,
    cameraKey: useWorkspaces().current,
    onSelect: (target, repeat) => {
      pill.close();
      sel.clicked(target, repeat);
    },
    onPill: pill.onPill,
    dim: filterFocus(views, filter),
    onMenu: (target, at) => menu.open(target, at),
    onDrop: (fromId, toId) => actions.onHandOffTo?.(fromId, toId),
    ...{ onFollow: setFollowId, onMeeting: setMeetingId, onSlow: () => setSlow(true) },
    onHover: hover.setHover,
    onFrame: () => [hover, pill].forEach((o) => o.place(controls, rootRef.current)),
  });
  const { pick, select, selected, selection } = sel;
  const menu = useGraphMenu({ views, actions, controls, following: followId, pick, select });
  const release = releaser(followId, controls, { pill, sel });
  useGraphEvents({ rootRef, controls, release, opened: sel.opened, life: lifeRef.current });
  const keyInputs = { views, actions, controls, release, selected, selection, select };
  const keys = useGraphKeys({ ...keyInputs, following: followId });
  const state = { filter, setFilter, meetingId, followId, slow };
  return { sel, hover, pill, controls, keys, menu, ...state };
}

/** Esc, from the graph, one thing at a time: a drag in progress (nothing
 *  dropped), a focused meeting, following, the grown pill, and last the
 *  selection. */
function releaser(
  followId: number | null,
  controls: GraphControls,
  open: {
    pill: { isOpen: () => boolean; close: () => void };
    sel: { clear: () => void };
  },
): () => void {
  const { pill, sel } = open;
  return () => {
    if (controls.cancelDrag() || controls.unfocusMeeting()) return;
    if (followId !== null) controls.follow(null);
    else if (pill.isOpen()) pill.close();
    else sel.clear();
  };
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
  // On screen: the big wave once a day, else a blink all together.
  useEffect(() => latest.current.life.showGraph(Date.now(), takeDailyWave(dayKey(new Date()))), []);
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
