import { isSupervisor } from '../agents/supervisionRules.js';
import { CLAWD_BOSS_COLORS, FILE_LINK_COLOR } from '../constants.js';
import { outfitOf } from '../identity/clawdOutfit.js';
import { clip } from '../identity/identityStore.js';
import { liveFileLinks } from '../office/behaviors/fileLinksStore.js';
import type { AgentView } from './agentViews.js';
import { clawdColor } from './clawdColor.js';
import { impatience } from './clawdImpatience.js';
import { type ClawdLife, isAsleep } from './clawdLife.js';
import { effortLevel, effortMarks, modelLook } from './clawdLook.js';
import { activityProp, arrivalMotion, trickMotion } from './clawdTricks.js';
import {
  type Bounds,
  type Camera,
  edgeArrow,
  isVisible,
  toScreen,
  type ViewSize,
} from './graphCamera.js';
import {
  clawdHeight,
  drawAlertBadge,
  drawCheckBadge,
  drawChip,
  drawClawd,
  drawEffortFlame,
  drawFilePass,
  drawLabelAt,
  drawLibrary,
  drawNodeDisc,
  drawRequestLine,
  drawThinkDots,
  drawVos,
  type GraphTheme,
  isPulsing,
  lighten,
  measureLabel,
  type Pose,
  poseFor,
  rgba,
} from './graphDraw.js';
import {
  drawCheckPop,
  drawConfetti,
  drawDetailCard,
  drawDizzy,
  drawEdgeArrow,
  drawHearts,
  drawZ,
  sparkColors,
} from './graphExtras.js';
import { floatOffset } from './graphFloat.js';
import { placeLabel, type Side } from './graphLabels.js';
import { pinOf } from './graphPins.js';
import type { SimEdge, SimNode } from './graphSim.js';

/** The world the nodes live in (the camera shows part or all of it). */
export const WORLD: ViewSize = { w: 1400, h: 880 };
export const VOS = { x: 80, y: 56 };
export const LIBRARY = { x: 110, y: WORLD.h - 110 };
const SUB_R = 22;
const NAME_CHARS = 20;
const STATUS_CHARS = 26;
const LIBRARY_R = 52;

type Box = { x: number; y: number; w: number; h: number };
export type Hit = { id: number; disc: { x: number; y: number; r: number }; label?: Box };

export interface SceneFrame {
  dpr: number;
  t: number;
  now: number;
  cam: Camera;
  view: ViewSize;
  /** Decorative effects off (calm mode or the slow-PC brake). */
  calm: boolean;
  /** Close-up cards under each agent (zoomed in). */
  detail: boolean;
  stage: string;
}

export interface SceneOut {
  hits: Hit[];
  vos: Box;
  /** Everything drawn, in world coords (for "Encuadrar todo" and the minimap). */
  content: Bounds;
  /** Off-screen waits: arrow boxes in screen coords. */
  arrows: Array<{ id: number; box: Box }>;
}

/** Where each node wants to be: a stable ring, pulled by what it is doing. */
export function layout(nodes: Map<string, SimNode>, list: AgentView[]) {
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;
  const ring = Math.min(WORLD.w, WORLD.h) * 0.34;
  const live = new Set<string>();
  list.forEach((v, i) => {
    const ang = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
    let ax = cx + Math.cos(ang) * ring;
    let ay = cy + Math.sin(ang) * ring * 0.8;
    const target = v.kind === 'needs' ? VOS : v.kind === 'research' ? LIBRARY : null;
    // Waiting on its supervisor: it leans toward the supervisor, not toward you.
    const boss = v.askingSupervisor ? nodes.get(`a${v.askingSupervisor.id}`) : undefined;
    if (target) {
      ax += (target.x - ax) * 0.45;
      ay += (target.y - ay) * 0.45;
    } else if (boss) {
      ax += (boss.ax - ax) * 0.3;
      ay += (boss.ay - ay) * 0.3;
    } else if (v.kind === 'idle' || v.kind === 'done') {
      ax = cx + (ax - cx) * 1.15;
      ay = cy + (ay - cy) * 1.15;
    }
    // Where you put it wins (its arrow to "Vos" still says when it needs you).
    const pin = pinOf(v.key);
    if (pin) {
      ax = pin.x;
      ay = pin.y;
    }
    const id = `a${v.id}`;
    live.add(id);
    upsert(nodes, id, ax, ay, radiusFor(v.kind) * lookOf(v).scale);
    const parent = nodes.get(id)!;
    const radius = meetingRadius(v.subagents.length);
    parent.group = id;
    parent.pad = v.subagents.length > 0 ? radius : 0;
    // A meeting is a circle around its lead, evenly spaced, leaving the
    // lead's right side free for its label (as in the preview artefact).
    v.subagents.forEach((s, j) => {
      const sa = meetingAngle(j, v.subagents.length);
      const sid = `s${s.id}`;
      live.add(sid);
      upsert(nodes, sid, parent.x + Math.cos(sa) * radius, parent.y + Math.sin(sa) * radius, SUB_R);
      nodes.get(sid)!.group = id;
    });
  });
  for (const id of [...nodes.keys()]) if (!live.has(id)) nodes.delete(id);
}

/** The free wedge on the lead's right (its label goes there), in radians. */
const LABEL_WEDGE = (80 * Math.PI) / 180;
/** Arc each subagent needs so their name chips do not touch. */
const SUB_ARC_PX = 125;

/** How far a meeting's subagents sit from their lead. */
export function meetingRadius(count: number): number {
  return Math.max(150, (count * SUB_ARC_PX) / (Math.PI * 2 - LABEL_WEDGE));
}

/** Where the j-th of n subagents sits around its lead (0 rad = right). */
export function meetingAngle(j: number, n: number): number {
  const span = Math.PI * 2 - LABEL_WEDGE;
  return LABEL_WEDGE / 2 + (span * (j + 0.5)) / n;
}

export function edgesOf(list: AgentView[]): SimEdge[] {
  const edges: SimEdge[] = [];
  for (const v of list) {
    const length = meetingRadius(v.subagents.length);
    for (const s of v.subagents) edges.push({ a: `a${v.id}`, b: `s${s.id}`, length, strength: 2 });
  }
  for (const v of list) {
    for (const bossId of v.supervisedBy)
      edges.push({ a: `a${bossId}`, b: `a${v.id}`, length: 260, strength: 0.3 });
  }
  for (const link of liveFileLinks()) {
    edges.push({ a: `s${link.fromId}`, b: `s${link.toId}`, length: 80, strength: 2.5 });
  }
  return edges;
}

/** How big an agent's disc is: it grows with activity, as in the preview —
 *  whoever works or needs you stands out, whoever is idle recedes. */
function radiusFor(kind: AgentView['kind']): number {
  if (kind === 'work' || kind === 'meet' || kind === 'research' || kind === 'needs') return 62;
  if (kind === 'think') return 54;
  if (kind === 'done') return 46;
  return 40;
}

function upsert(nodes: Map<string, SimNode>, id: string, ax: number, ay: number, r: number) {
  const n = nodes.get(id);
  if (n) {
    n.ax = ax;
    n.ay = ay;
    n.r += (r - n.r) * 0.12; // grow and shrink smoothly
  } else {
    nodes.set(id, { id, x: ax, y: ay, vx: 0, vy: 0, r, ax, ay });
  }
}

const colorOf = (v: AgentView) => clawdColor(v.palette, v.hueShift);
/** His model's look: what the session reports, else what the office launched
 *  it with. */
const lookOf = (v: AgentView) => modelLook(v.model ?? v.runModel);

/** Draw a Clawd standing on a world point (he is drawn in screen pixels). */
function clawdAt(
  ctx: CanvasRenderingContext2D,
  f: SceneFrame,
  x: number,
  footY: number,
  scale: number,
  color: string,
  pose: ReturnType<typeof poseFor>,
) {
  const s = toScreen(f.cam, { x, y: footY });
  drawClawd(ctx, s.x, s.y, scale * f.cam.zoom, color, pose, f.dpr);
}

function background(ctx: CanvasRenderingContext2D, th: GraphTheme, f: SceneFrame) {
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.fillStyle = f.stage;
  ctx.fillRect(0, 0, f.view.w, f.view.h);
  // The dot grid moves with the world, so panning reads as panning.
  const step = 26 * f.cam.zoom;
  if (step < 8) return;
  ctx.fillStyle = rgba(th.line2, 0.6);
  const ox = (-f.cam.x * f.cam.zoom) % step;
  const oy = (-f.cam.y * f.cam.zoom) % step;
  for (let x = ox; x < f.view.w; x += step)
    for (let y = oy; y < f.view.h; y += step) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function worldTransform(ctx: CanvasRenderingContext2D, f: SceneFrame) {
  const z = f.cam.zoom * f.dpr;
  ctx.setTransform(z, 0, 0, z, -f.cam.x * z, -f.cam.y * z);
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  list: AgentView[],
  nodes: Map<string, SimNode>,
) {
  for (const v of list) {
    const a = nodes.get(`a${v.id}`);
    for (const s of v.subagents) {
      const b = nodes.get(`s${s.id}`);
      if (!a || !b) continue;
      ctx.strokeStyle = colorOf(v);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // A supervisor's dashed line to each agent it looks after.
  for (const v of list) {
    const b = nodes.get(`a${v.id}`);
    for (const bossId of v.supervisedBy) {
      const a = nodes.get(`a${bossId}`);
      if (!a || !b) continue;
      ctx.strokeStyle = CLAWD_BOSS_COLORS.link;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const link of liveFileLinks()) {
    const a = nodes.get(`s${link.fromId}`);
    const b = nodes.get(`s${link.toId}`);
    if (!a || !b) continue;
    const file = `${clip(link.lastFile, 22)}${link.count > 1 ? ` ×${link.count}` : ''}`;
    drawFilePass(ctx, th, a, b, file, FILE_LINK_COLOR, f.t);
  }
}

/** The nodes where they are drawn: floating gently (not in calm mode). The
 *  simulation keeps its own positions; only the picture moves. */
function floating(nodes: Map<string, SimNode>, f: SceneFrame): Map<string, SimNode> {
  if (f.calm) return nodes;
  const shown = new Map<string, SimNode>();
  for (const [id, n] of nodes) shown.set(id, { ...n, y: n.y + floatOffset(id, f.t) });
  return shown;
}

/** One frame of the graph. Returns what is clickable and what was drawn. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  list: AgentView[],
  simNodes: Map<string, SimNode>,
  selectedId: number | null,
  life: ClawdLife,
): SceneOut {
  const nodes = floating(simNodes, f);
  background(ctx, th, f);
  worldTransform(ctx, f);
  if (list.some((v) => v.kind === 'research' || v.subagents.some((s) => s.kind === 'research'))) {
    drawLibrary(ctx, th, LIBRARY.x, LIBRARY.y, LIBRARY_R);
  }
  drawLinks(ctx, th, f, list, nodes);

  const needing = list.filter((v) => v.kind === 'needs');
  const pulsing = new Set(needing.filter((v) => isPulsing(f.now - waitStart(v))).map((v) => v.id));
  // Everything a label must not cover: nodes, request pills, labels already placed.
  const obstacles: Box[] = [];
  for (const n of nodes.values())
    obstacles.push({ x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 });
  obstacles.push({ x: VOS.x - 34, y: VOS.y - 18, w: 68, h: 36 });
  for (const v of needing) {
    const n = nodes.get(`a${v.id}`);
    const pill = n ? drawRequestLine(ctx, th, n, VOS, f.t, askOf(v)) : null;
    if (pill) obstacles.push(pill);
  }
  // A supervised agent asks its supervisor: the same arrow, to the supervisor.
  for (const v of list) {
    const n = v.askingSupervisor ? nodes.get(`a${v.id}`) : undefined;
    const boss = v.askingSupervisor ? nodes.get(`a${v.askingSupervisor.id}`) : undefined;
    if (!n || !boss) continue;
    const pill = drawRequestLine(
      ctx,
      th,
      n,
      { x: boss.x, y: boss.y + boss.r * 0.6 },
      f.t,
      askOf(v),
    );
    if (pill) obstacles.push(pill);
  }

  const content: Bounds = {
    minX: VOS.x - 40,
    minY: VOS.y - 24,
    maxX: VOS.x + 40,
    maxY: VOS.y + 24,
  };
  const grow = (b: Box) => {
    content.minX = Math.min(content.minX, b.x);
    content.minY = Math.min(content.minY, b.y);
    content.maxX = Math.max(content.maxX, b.x + b.w);
    content.maxY = Math.max(content.maxY, b.y + b.h);
  };
  const hits: Hit[] = [];
  list.forEach((v, index) => {
    const lead = nodes.get(`a${v.id}`);
    const subColor = lighten(colorOf(v), 0.3);
    for (const s of v.subagents) {
      const n = nodes.get(`s${s.id}`);
      if (!n) continue;
      drawNodeDisc(ctx, th, n.x, n.y, n.r, subColor, s.kind, f.t, false);
      clawdAt(
        ctx,
        f,
        n.x,
        n.y + clawdHeight(n.r / 16, f.dpr) / 2,
        n.r / 16,
        subColor,
        poseFor(s.kind, s.id, f.t),
      );
      worldTransform(ctx, f);
      // One line, on the side away from the lead, so chips never cover it.
      const above = !!lead && n.y < lead.y - 4;
      const top = above ? n.y - n.r - 26 : n.y + n.r + 6;
      const chip = drawChip(ctx, th, n.x, top, clip(s.label, NAME_CHARS), subColor, s.kind);
      obstacles.push(chip);
      grow(chip);
      hits.push({ id: v.id, disc: n, label: chip });
    }
    const n = nodes.get(`a${v.id}`);
    if (!n) return;
    drawAgentBody(
      ctx,
      th,
      f,
      v,
      n,
      { selected: v.id === selectedId, pulsing: pulsing.has(v.id), index },
      life,
    );
    grow({ x: n.x - n.r, y: n.y - n.r - 20, w: n.r * 2, h: n.r * 2 + 20 });
  });

  // Labels last, placed where they cover nothing; whoever needs you first.
  const order = [...list].sort(
    (a, b) => (a.kind === 'needs' ? 0 : 1) - (b.kind === 'needs' ? 0 : 1),
  );
  for (const v of order) {
    const n = nodes.get(`a${v.id}`);
    if (!n) continue;
    const label = drawAgentLabel(ctx, th, f, v, n, obstacles);
    grow(label);
    hits.push({ id: v.id, disc: n, label });
  }

  drawVos(ctx, th, VOS.x, VOS.y, needing.length > 0, f.t, pulsing.size > 0);
  ctx.textAlign = 'left';
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  const arrows = drawOffscreenWaits(ctx, th, f, needing, nodes);
  return {
    hits: hits.reverse(),
    vos: { x: VOS.x - 30, y: VOS.y - 16, w: 60, h: 32 },
    content,
    arrows,
  };
}

/** How Clawd stands right now: his state's pose plus the little life on top
 *  (hello wave, arrival, trick, celebration bounces, what he holds, the
 *  fidgeting of a long wait), and how far up he is lifted. What you dressed
 *  him in always shows; the decorative parts stay off in calm mode. */
function livePose(
  v: AgentView,
  f: SceneFrame,
  life: ClawdLife,
  index: number,
): { pose: Pose; lift: number } {
  const pose: Pose = {
    ...poseFor(v.kind, v.id, f.t),
    area: v.area,
    prop: activityProp(v, life.workingFor(v.id, f.now)),
    outfit: outfitOf(v.key),
    // What the session reports, else what the office launched it with.
    effort: effortLevel(v.effort ?? v.runEffort),
    boss: isSupervisor(v),
    form: lookOf(v).form,
    material: lookOf(v).material,
    // The model's own motions (shine, cape, snips) stay still in calm mode.
    anim: f.calm ? undefined : f.t + v.id,
  };
  if (isAsleep(v, f.now)) Object.assign(pose, { sleep: true, blink: false });
  if (life.blinking(v.id, f.now)) pose.blink = true;
  if (f.calm) return { pose, lift: 0 };
  const fidget = v.kind === 'needs' ? impatience(f.now - waitStart(v), f.t, v.id) : null;
  if (fidget) {
    // Tapping and checking the time replaces the wave: still visible, calmer.
    pose.wave = undefined;
    pose.footUp = fidget.footUp;
    pose.watch = fidget.watch;
  }
  let lift = life.hop(v.id, f.now);
  if (pose.wave === undefined && !pose.sleep && life.waving(index, f.now)) {
    pose.wave = Math.floor(f.t * 5) % 2;
  }
  const arriving = life.arrival(v.id, f.now);
  if (arriving !== null) {
    const m = arrivalMotion(arriving);
    pose.scaleK = m.scaleK;
    lift += m.lift;
  }
  const trick = life.trick(v.id, f.now);
  if (trick) {
    const { lift: up = 0, ...motion } = trickMotion(trick.trick, trick.p);
    Object.assign(pose, motion);
    if (motion.happy) pose.blink = false;
    lift += up;
  }
  return { pose, lift };
}

/** One agent's body: disc, Clawd (with its little life) and badges. */
function drawAgentBody(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  v: AgentView,
  n: SimNode,
  at: { selected: boolean; pulsing: boolean; index: number },
  life: ClawdLife,
): void {
  const color = colorOf(v);
  ctx.globalAlpha = v.kind === 'idle' ? 0.75 : 1;
  // Maximum effort: a flame around the bubble (the headband is on Clawd).
  if (!f.calm && effortMarks(effortLevel(v.effort ?? v.runEffort)) === 3) {
    drawEffortFlame(ctx, n.x, n.y, n.r, f.t + v.id);
  }
  drawNodeDisc(ctx, th, n.x, n.y, n.r, color, v.kind, f.t, at.selected, at.pulsing, {
    shape: lookOf(v).rim,
    spin: f.calm ? 0 : f.t + v.id,
  });
  // Clawd fills his disc, as in the preview (the disc grows with activity).
  const scale = n.r / 15;
  const { pose, lift } = livePose(v, f, life, at.index);
  const foot = n.y + clawdHeight(scale, f.dpr) / 2 - lift;
  clawdAt(ctx, f, n.x, foot, scale, color, pose);
  worldTransform(ctx, f);
  const head = foot - clawdHeight(scale * f.cam.zoom, f.dpr) / f.cam.zoom;
  if (v.kind === 'think') drawThinkDots(ctx, th, n.x, head, f.t);
  if (pose.sleep && !f.calm) drawZ(ctx, th, n.x + 10, head, f.t + v.id);
  const badge = Math.max(7, n.r * 0.18);
  if (v.kind === 'needs') drawAlertBadge(ctx, th, n.x + n.r * 0.72, n.y - n.r * 0.72, badge);
  if (v.kind === 'done') drawCheckBadge(ctx, th, n.x + n.r * 0.72, n.y - n.r * 0.72, badge);
  ctx.globalAlpha = 1;
  if (!f.calm) drawLifeEffects(ctx, th, f, v, n, head, life, color);
}

/** The effects around him: a task's ✓, confetti in his colours, trick extras. */
function drawLifeEffects(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  v: AgentView,
  n: SimNode,
  head: number,
  life: ClawdLife,
  color: string,
): void {
  const check = life.check(v.id, f.now);
  if (check !== null) drawCheckPop(ctx, th, n.x - n.r * 0.7, n.y - n.r * 0.7, check);
  const burst = life.burst(v.id, f.now);
  if (burst !== null) drawConfetti(ctx, n.x, n.y - n.r * 0.4, burst, v.id, sparkColors(color));
  const trick = life.trick(v.id, f.now);
  if (trick?.trick === 'hearts') drawHearts(ctx, th, n.x, head, trick.p);
  if (trick?.trick === 'dizzy') drawDizzy(ctx, th, n.x, head, trick.p);
}

/** Labels already placed, by agent: a label keeps its side while it is free. */
const labelSides = new Map<string, Side>();

/**
 * One agent's label (and its close-up when zoomed in), where it covers
 * nothing: below by default; a meeting's lead prefers its free right side.
 */
function drawAgentLabel(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  v: AgentView,
  n: SimNode,
  obstacles: Box[],
): Box {
  const name = clip(v.name, NAME_CHARS);
  const status = clip(v.statusText, STATUS_CHARS);
  const size = measureLabel(ctx, name, status, false);
  const prefer: Side[] =
    v.subagents.length > 0
      ? ['right', 'left', 'below', 'above']
      : ['below', 'left', 'right', 'above'];
  const box = placeLabel(v.key, n, size, prefer, obstacles, labelSides);
  drawLabelAt(ctx, th, box, name, status, v.kind, colorOf(v), false);
  obstacles.push(box);
  const hasDetail = v.tasks.length > 0 || !!v.lastReplyHead || v.contextPct !== undefined;
  if (!f.detail || !hasDetail) return box;
  const card = drawDetailCard(ctx, th, box.x + 110, box.y + box.h + 6, v);
  obstacles.push(card);
  return {
    x: Math.min(box.x, card.x),
    y: box.y,
    w: Math.max(box.x + box.w, card.x + card.w) - Math.min(box.x, card.x),
    h: card.y + card.h - box.y,
  };
}

/** What a permission asks to run, for the pill on its line to "Vos". */
function askOf(v: AgentView): string | undefined {
  const p = v.permission;
  if (!p) return undefined;
  const command = (p.toolInput as Record<string, unknown>).command;
  return typeof command === 'string' ? clip(command.split('\n')[0], 34) : p.toolName;
}

/** Whoever waits on you but is off-screen gets an arrow on the border. */
function drawOffscreenWaits(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  f: SceneFrame,
  needing: AgentView[],
  nodes: Map<string, SimNode>,
): Array<{ id: number; box: Box }> {
  const out: Array<{ id: number; box: Box }> = [];
  for (const v of needing) {
    const n = nodes.get(`a${v.id}`);
    if (!n || isVisible(f.cam, f.view, n, -n.r * f.cam.zoom)) continue;
    const at = edgeArrow(f.cam, f.view, n, 22);
    out.push({ id: v.id, box: drawEdgeArrow(ctx, th, at, clip(v.name, NAME_CHARS)) });
  }
  return out;
}

/** When this wait began: the server's time when known; otherwise the moment
 *  this page first saw it (only used to pace the rings, never shown). */
const firstSeen = new Map<string, number>();
function waitStart(v: AgentView): number {
  if (v.waitingSince !== undefined) return v.waitingSince;
  const key = `${v.id}:${v.statusText}`;
  let at = firstSeen.get(key);
  if (at === undefined) {
    at = Date.now();
    firstSeen.set(key, at);
  }
  return at;
}
