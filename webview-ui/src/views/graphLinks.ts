import { CLAWD_BOSS_COLORS, FILE_LINK_COLOR } from '../constants.js';
import { clip } from '../identity/identityStore.js';
import { liveFileLinks } from '../office/behaviors/fileLinksStore.js';
import type { AgentView } from './agentViews.js';
import { clawdColor } from './clawdColor.js';
import type { Pt } from './graphCamera.js';
import { drawFilePass, type GraphTheme } from './graphDraw.js';
import type { Passive } from './graphHit.js';
import { DIM_ALPHA } from './graphHover.js';
import { libraryCenter, libraryRadius, libraryVisitors } from './graphLibrary.js';
import type { SceneFrame } from './graphScene.js';
import type { SimNode } from './graphSim.js';
import { WORLD } from './graphWorld.js';

/**
 * The graph's lines: a lead to its members (and to the library), a
 * supervisor to its team, a file passed between members. Each reports its
 * segment so a click on it is not taken for the background, and fades with
 * the rest when its ends are out of focus.
 */

const colorOf = (v: AgentView) => clawdColor(v.palette, v.hueShift);

/** What every part of one frame draws with, and where it reports what a
 *  click must not take for the background. */
export interface Pen {
  ctx: CanvasRenderingContext2D;
  th: GraphTheme;
  f: SceneFrame;
  nodes: Map<string, SimNode>;
  passive: Passive;
  fade: Fade;
}

type Fade = <T>(keys: readonly string[], draw: () => T) => T;

/** Draws a part at full strength when all its nodes (`a3`, `s-7`, 'vos',
 *  'library') are in focus or nothing is hovered; faded otherwise. */
export function fader(
  ctx: CanvasRenderingContext2D,
  focus: ReadonlySet<string> | null | undefined,
  alpha = DIM_ALPHA,
): Fade {
  return (keys, draw) => {
    if (!focus || keys.every((k) => focus.has(k))) return draw();
    ctx.save();
    ctx.globalAlpha *= alpha;
    try {
      return draw();
    } finally {
      ctx.restore();
    }
  };
}

interface LineStyle {
  color: string;
  width?: number;
  alpha?: number;
  dash?: number[];
  /** Soft dots (to the library, or to a member that went there), not the
   *  supervisor's dashes. */
  dotted?: boolean;
}

/** One straight link between two nodes (or a node and the library), named
 *  by `keys` (it stays crisp when both are in focus). */
function strokeLink(pen: Pen, a: Pt, b: Pt, style: LineStyle, keys: [string, string]) {
  pen.fade(keys, () => strokePath(pen.ctx, a, b, style));
  pen.passive.segments.push([
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
  ]);
}

function strokePath(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, style: LineStyle) {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.globalAlpha *= style.alpha ?? (style.dotted ? 0.5 : 1);
  ctx.lineWidth = style.width ?? (style.dotted ? 2 : 1.4);
  if (style.dotted) {
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, 6]);
  } else if (style.dash) {
    ctx.setLineDash(style.dash);
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function drawLinks(pen: Pen, list: AgentView[]) {
  drawMeetingLinks(pen, list);
  // A supervisor's dashed line to each agent it looks after.
  for (const v of list) {
    const b = pen.nodes.get(`a${v.id}`);
    for (const bossId of v.supervisedBy) {
      const a = pen.nodes.get(`a${bossId}`);
      if (!a || !b) continue;
      const style = { color: CLAWD_BOSS_COLORS.link, dash: [5, 6] };
      strokeLink(pen, a, b, style, [`a${bossId}`, `a${v.id}`]);
    }
  }
  for (const link of liveFileLinks()) {
    const a = pen.nodes.get(`s${link.fromId}`);
    const b = pen.nodes.get(`s${link.toId}`);
    if (!a || !b) continue;
    const file = `${clip(link.lastFile, 22)}${link.count > 1 ? ` ×${link.count}` : ''}`;
    // Calm mode: the dashes stay still.
    const t = pen.f.calm ? 0 : pen.f.t;
    const keys = [`s${link.fromId}`, `s${link.toId}`];
    const chip = pen.fade(keys, () =>
      drawFilePass(pen.ctx, pen.th, a, b, file, FILE_LINK_COLOR, t),
    );
    pen.passive.boxes.push(chip);
    pen.passive.segments.push([
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ]);
  }
}

/** A lead's lines to its members, and to the library while it reads there. */
function drawMeetingLinks(pen: Pen, list: AgentView[]) {
  const visitors = libraryVisitors(list).length;
  const library = libraryCenter(visitors, WORLD.h);
  const libraryR = libraryRadius(visitors);
  for (const v of list) {
    const a = pen.nodes.get(`a${v.id}`);
    if (!a) continue;
    // A researching agent too big to walk in: a dotted line to the library.
    if (v.kind === 'research') {
      const d = Math.hypot(library.x - a.x, library.y - a.y) || 1;
      const k = Math.max(0, d - libraryR) / d;
      const edge = { x: a.x + (library.x - a.x) * k, y: a.y + (library.y - a.y) * k };
      strokeLink(pen, a, edge, { color: pen.th.research, dotted: true }, [`a${v.id}`, 'library']);
    }
    for (const s of v.subagents) {
      const b = pen.nodes.get(`s${s.id}`);
      if (!b) continue;
      // Gone to the library: still tied to its lead, by a dotted line.
      strokeLink(
        pen,
        a,
        b,
        s.kind === 'research'
          ? { color: colorOf(v), dotted: true }
          : { color: colorOf(v), alpha: 0.45, width: 1.6 },
        [`a${v.id}`, `s${s.id}`],
      );
    }
  }
}
