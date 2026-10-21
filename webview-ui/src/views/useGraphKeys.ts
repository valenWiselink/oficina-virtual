import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { riskyReason } from '../permissions/riskyCommand.js';
import { CONFIRM_WINDOW_MS } from '../permissions/useRiskyApprove.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import { type GraphKey, graphKeyOf, twoPressStep } from './graphKeys.js';
import { stepIn, tabOrder } from './graphPick.js';
import type { GraphControls, GraphSelection } from './useGraphCanvas.js';

/** How long a key's answer ("Aprobado", "Elegí un agente…") stays. */
const HINT_MS = 3500;

export interface GraphKeyInputs {
  views: AgentView[];
  actions: BoardActions;
  controls: GraphControls;
  selected: AgentView | undefined;
  selection: GraphSelection | null;
  /** Select on the graph only (its terminal opens with Enter). */
  select: (sel: GraphSelection) => void;
  following: number | null;
  /** Esc: stop following, shrink the pill, let go of the selection. */
  release: () => void;
}

interface KeyUi {
  say: (text: string) => void;
  helpOpen: boolean;
  setHelp: (open: boolean) => void;
  armed: RefObject<{ token: string; at: number } | null>;
  cursor: RefObject<number | null>;
  /** The agent picked with Tab (not a click): A and H act on it at once. */
  keyed: RefObject<number | null>;
}

/** A and H: act now, or arm and say why a second press is needed. */
function pressTwice(v: AgentView, ui: KeyUi, token: string, risk: string | null): boolean {
  const byKeys = ui.keyed.current === v.id;
  const now = Date.now();
  if (twoPressStep(!!risk || !byKeys, ui.armed.current, token, now, CONFIRM_WINDOW_MS) === 'act') {
    ui.armed.current = null;
    return true;
  }
  ui.armed.current = { token, at: now };
  const key = token.startsWith('approve') ? 'A' : 'H';
  ui.say(
    risk
      ? `Riesgoso: ${risk}. Apretá A otra vez para aprobarlo`
      : `¿${v.name}? Apretá ${key} otra vez (o elegilo con Tab)`,
  );
  return false;
}

function approve(v: AgentView, inp: GraphKeyInputs, ui: KeyUi): void {
  const p = v.permission;
  if (!p || !inp.actions.onAllow) {
    ui.say(`${v.name} no tiene un permiso para aprobar acá`);
    return;
  }
  const risk = riskyReason(p.toolName, p.toolInput as Record<string, unknown>);
  if (!pressTwice(v, ui, `approve:${p.requestId}`, risk)) return;
  inp.actions.onAllow(p.requestId);
  ui.say(`Aprobado lo que pedía ${v.name}`);
}

function markDone(v: AgentView, inp: GraphKeyInputs, ui: KeyUi): void {
  if (!v.yourTurnId || !inp.actions.onYourTurnDone) {
    ui.say(`${v.name} no te dejó nada para marcar`);
    return;
  }
  if (!pressTwice(v, ui, `done:${v.yourTurnId}`, null)) return;
  inp.actions.onYourTurnDone(v.yourTurnId);
  ui.say('Listo, marcado como hecho');
}

/** Tab: the next agent (whoever waits first). false past the end: the
 *  key goes on, out of the graph. */
function step(dir: 1 | -1, inp: GraphKeyInputs, ui: KeyUi): boolean {
  const next = stepIn(tabOrder(inp.views), ui.cursor.current, dir);
  ui.cursor.current = next;
  ui.keyed.current = next;
  if (next === null) return false;
  inp.select({ id: next });
  inp.controls.focusOn(next);
  return true;
}

/** What one key does; false when the graph lets it go. */
function run(key: GraphKey, inp: GraphKeyInputs, ui: KeyUi): boolean {
  const v = inp.selected;
  const needsOne = key.kind === 'zoomSelected' || key.kind === 'open' || key.kind === 'approve';
  if (!v && (needsOne || key.kind === 'done' || key.kind === 'follow')) {
    ui.say('Elegí un agente primero (Tab)');
    return true;
  }
  switch (key.kind) {
    case 'fit':
      inp.controls.fitAll();
      break;
    case 'zoom':
      inp.controls.zoomBy(key.factor);
      break;
    case 'pan':
      inp.controls.panBy(key.dx, key.dy);
      break;
    case 'zoomSelected':
      inp.controls.centerOn(v!.id, inp.selection?.member);
      break;
    case 'step':
      return step(key.dir, inp, ui);
    case 'open':
      inp.actions.onSelect(v!.id);
      break;
    case 'approve':
      approve(v!, inp, ui);
      break;
    case 'done':
      markDone(v!, inp, ui);
      break;
    case 'follow':
      inp.controls.follow(inp.following === v!.id ? null : v!.id);
      break;
    case 'release':
      if (ui.helpOpen) ui.setHelp(false);
      else inp.release();
      break;
    case 'help':
      ui.setHelp(!ui.helpOpen);
      break;
  }
  return true;
}

/**
 * The graph's keys while its canvas has the focus (graphKeys.ts says which),
 * the short answer each one gives, and the "?" list.
 */
export function useGraphKeys(inp: GraphKeyInputs) {
  const [hint, setHint] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const armed = useRef<{ token: string; at: number } | null>(null);
  const cursor = useRef<number | null>(null);
  const keyed = useRef<number | null>(null);
  const selectedId = inp.selection?.id ?? null;
  useEffect(() => {
    cursor.current = selectedId;
    // Picked some other way (a click, Alt+N): no longer "picked with Tab".
    if (keyed.current !== selectedId) keyed.current = null;
  }, [selectedId]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);
  const ui: KeyUi = { say: setHint, helpOpen: help, setHelp, armed, cursor, keyed };

  return {
    hint,
    help,
    closeHelp: () => setHelp(false),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      const key = graphKeyOf(e);
      // Only the very next press confirms: anything else in between disarms.
      if (key?.kind !== 'approve' && key?.kind !== 'done') armed.current = null;
      if (!key || !run(key, inp, ui)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    /** Tabbing in starts the round again, and says where the list is. */
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.matches(':focus-visible')) return;
      cursor.current = null;
      setHint('Atajos del grafo: apretá ?');
    },
  };
}
