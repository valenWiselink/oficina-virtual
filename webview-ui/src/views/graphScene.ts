import { isSupervisor } from '../agents/supervisionRules.js';
import { outfitOf } from '../identity/clawdOutfit.js';
import { clip } from '../identity/identityStore.js';
import { liveFileLinks } from '../office/behaviors/fileLinksStore.js';
import type { AgentView } from './agentViews.js';
import { clawdColor } from './clawdColor.js';
import { GAZE_NEAR_PX, type GazeContext, gazeTarget, lookToward } from './clawdGaze.js';
import { impatience } from './clawdImpatience.js';
import { type ClawdLife, isAsleep } from './clawdLife.js';
import { effortLevel, effortMarks, modelLook } from './clawdLook.js';
import { activityProp, arrivalMotion, nodMotion, trickMotion } from './clawdTricks.js';
import {
  type Bounds,
  type Camera,
  edgeArrow,
  isVisible,
  type Pt,
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
  setFont,
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
import type { Box, Hit, HitScene } from './graphHit.js';
import { placeLabel, type Side } from './graphLabels.js';
import {
  keepsMeetingEdge,
  libraryCenter,
  libraryOpen,
  libraryRadius,
  librarySpot,
  libraryVisitors,
} from './graphLibrary.js';
import { drawLinks, fader, type Pen } from './graphLinks.js';
import { meetingAngle, type MeetingCircle, meetingCircles, meetingRadius } from './graphMeeting.js';
import { pinOf } from './graphPins.js';
import type { SimEdge, SimNode } from './graphSim.js';

export { meetingAngle, meetingRadius } from './graphMeeting.js';
export { VOS, WORLD } from './graphWorld.js';
import { VOS, WORLD } from './graphWorld.js';
const SUB_R = 22;
const NAME_CHARS = 20;
const STATUS_CHARS = 26;

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
  /** The pointer in world coords while it moved lately (the Clawds look). */
  pointer?: Pt | null;
}

/** What the frame marks: the selected agent, or one member of its meeting. */
export interface SceneMarks {
  selectedId: number | null;
  /** A member picked in the selected lead's meeting: the ring goes on it. */
  selectedMember?: number | null;
  /** While you hover an agent, what stays crisp (graphHover.ts focusOf);
   *  everything else fades. null: everything crisp. */
  focus?: ReadonlySet<string> | null;
  /** How visible the rest stays (hovering: 40 %; a filter or a meeting in
   *  focus: less). */
  focusAlpha?: number;
  /** While you drag an agent over another: the one that would get its answer,
   *  and the dragged one (drawn see-through, so the target shows). */
  dropTarget?: number | null;
  dragged?: number | null;
}

/** What is clickable (graphHit.ts reads it) and what was drawn. */
export interface SceneOut extends HitScene {
  /** Everything drawn, in world coords (for "Encuadrar todo" and the minimap). */
  content: Bounds;
  /** Each meeting's circle around its lead (a double click in its hole
   *  focuses it), world coords. */
  meetings: MeetingCircle[];
}

/** Where each node wants to be: a stable ring, pulled by what it is doing. */
export function layout(nodes: Map<string, SimNode>, list: AgentView[]) {
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;
  const ring = Math.min(WORLD.w, WORLD.h) * 0.34;
  const live = new Set<string>();
  const visitors = libraryVisitors(list);
  const library = libraryCenter(visitors.length, WORLD.h);
  list.forEach((v, i) => {
    const ang = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
    let ax = cx + Math.cos(ang) * ring;
    let ay = cy + Math.sin(ang) * ring * 0.8;
    const target = v.kind === 'needs' ? VOS : v.kind === 'research' ? library : null;
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
      // Researching: it walks to its seat in the library (its own stays free).
      const spot = librarySpot(visitors, v.id, s.id, WORLD.h);
      upsert(
        nodes,
        sid,
        spot ? spot.x : parent.x + Math.cos(sa) * radius,
        spot ? spot.y : parent.y + Math.sin(sa) * radius,
        SUB_R,
      );
      nodes.get(sid)!.group = id;
    });
  });
  for (const id of [...nodes.keys()]) if (!live.has(id)) nodes.delete(id);
}

export function edgesOf(list: AgentView[]): SimEdge[] {
  const edges: SimEdge[] = [];
  for (const v of list) {
    const length = meetingRadius(v.subagents.length);
    for (const s of v.subagents) {
      if (keepsMeetingEdge(s.kind))
        edges.push({ a: `a${v.id}`, b: `s${s.id}`, length, strength: 2 });
    }
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
  marks: SceneMarks,
  life: ClawdLife,
): SceneOut {
  const nodes = floating(simNodes, f);
  const pen: Pen = {
    ctx,
    th,
    f,
    nodes,
    passive: { boxes: [], circles: [], segments: [] },
    fade: fader(ctx, marks.focus, marks.focusAlpha),
  };
  background(ctx, th, f);
  worldTransform(ctx, f);
  const content = drawLibraryArea(pen, list);
  drawLinks(pen, list);
  const needing = list.filter((v) => v.kind === 'needs');
  const pulsing = new Set(needing.filter((v) => isPulsing(f.now - waitStart(v))).map((v) => v.id));
  // Everything a label must not cover: nodes, request pills, labels already placed.
  const obstacles: Box[] = [];
  for (const n of nodes.values())
    obstacles.push({ x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 });
  obstacles.push({ x: VOS.x - 34, y: VOS.y - 18, w: 68, h: 36 });
  const pills = drawRequests(pen, list, obstacles);
  const hits = drawBodies(pen, list, marks, life, { obstacles, content, pulsing });
  pen.fade(['vos'], () =>
    drawVos(ctx, th, VOS.x, VOS.y, needing.length > 0, f.t, pulsing.size > 0),
  );
  ctx.textAlign = 'left';
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  const arrows = drawOffscreenWaits(ctx, th, f, needing, nodes);
  return {
    hits,
    vos: { x: VOS.x - 30, y: VOS.y - 16, w: 60, h: 32 },
    content,
    arrows,
    pills,
    passive: pen.passive,
    meetings: meetingCircles(list, nodes),
  };
}

function grow(content: Bounds, b: Box) {
  content.minX = Math.min(content.minX, b.x);
  content.minY = Math.min(content.minY, b.y);
  content.maxX = Math.max(content.maxX, b.x + b.w);
  content.maxY = Math.max(content.maxY, b.y + b.h);
}

/** The library while it is open ("Encuadrar" keeps it in view). Returns the
 *  bounds of what is drawn so far, starting with "Vos". */
function drawLibraryArea(pen: Pen, list: AgentView[]): Bounds {
  const content: Bounds = {
    minX: VOS.x - 40,
    minY: VOS.y - 24,
    maxX: VOS.x + 40,
    maxY: VOS.y + 24,
  };
  if (!libraryOpen(list)) return content;
  const visitors = libraryVisitors(list).length;
  const { x, y } = libraryCenter(visitors, WORLD.h);
  const r = libraryRadius(visitors);
  // Who is there: the members inside and the agents reading from outside.
  const reading = visitors + list.filter((v) => v.kind === 'research').length;
  pen.fade(['library'], () => drawLibrary(pen.ctx, pen.th, x, y, r, reading));
  pen.passive.circles.push({ x, y, r });
  grow(content, { x: x - r, y: y - r - 18, w: r * 2, h: r * 2 + 18 });
  return content;
}

/** Each request's arrow: to "Vos", or, for a supervised agent, the same arrow
 *  to its supervisor. Returns the pills on the lines to "Vos" (you can act
 *  on those); the supervisor's are only kept from closing the panel. */
function drawRequests(
  pen: Pen,
  list: AgentView[],
  obstacles: Box[],
): Array<{ id: number; box: Box }> {
  // Calm mode: the dashes stay still.
  const t = pen.f.calm ? 0 : pen.f.t;
  const pills: Array<{ id: number; box: Box }> = [];
  for (const v of list) {
    const n = pen.nodes.get(`a${v.id}`);
    const boss = v.askingSupervisor ? pen.nodes.get(`a${v.askingSupervisor.id}`) : undefined;
    const to = v.kind === 'needs' ? VOS : boss ? { x: boss.x, y: boss.y + boss.r * 0.6 } : null;
    if (!n || !to) continue;
    const keys = [`a${v.id}`, v.kind === 'needs' ? 'vos' : `a${v.askingSupervisor?.id}`];
    const pill = pen.fade(keys, () => drawRequestLine(pen.ctx, pen.th, n, to, t, askOf(v)));
    pen.passive.segments.push([
      { x: n.x, y: n.y },
      { x: to.x, y: to.y },
    ]);
    if (!pill) continue;
    obstacles.push(pill);
    if (v.kind === 'needs') pills.push({ id: v.id, box: pill });
    else pen.passive.boxes.push(pill);
  }
  return pills;
}

interface Placing {
  /** What a label must not cover; grows as labels are placed. */
  obstacles: Box[];
  content: Bounds;
  pulsing: Set<number>;
}

/** Members and agents: bodies first, then the labels where they cover
 *  nothing (whoever needs you first). Returns the hits, topmost first. */
function drawBodies(
  pen: Pen,
  list: AgentView[],
  marks: SceneMarks,
  life: ClawdLife,
  at: Placing,
): Hit[] {
  const hits: Hit[] = [];
  const gaze = gazeOf(pen, list, life);
  list.forEach((v, index) => {
    drawMembers(pen, v, marks, at, hits);
    const n = pen.nodes.get(`a${v.id}`);
    if (!n) return;
    // A member picked in its meeting takes the ring.
    const selected = v.id === marks.selectedId && marks.selectedMember == null;
    const state = { selected, pulsing: at.pulsing.has(v.id), index, gaze };
    const body = () => drawAgentBody(pen.ctx, pen.th, pen.f, v, n, state, life);
    if (v.id === marks.dragged && marks.dropTarget != null) seeThrough(pen.ctx, body);
    else pen.fade([`a${v.id}`], body);
    if (v.id === marks.dropTarget)
      drawDropRing(
        pen,
        n,
        list.find((x) => x.id === marks.dragged),
      );
    grow(at.content, { x: n.x - n.r, y: n.y - n.r - 20, w: n.r * 2, h: n.r * 2 + 20 });
  });
  const order = [...list].sort(
    (a, b) => (a.kind === 'needs' ? 0 : 1) - (b.kind === 'needs' ? 0 : 1),
  );
  for (const v of order) {
    const n = pen.nodes.get(`a${v.id}`);
    if (!n) continue;
    const label = pen.fade([`a${v.id}`], () =>
      drawAgentLabel(pen.ctx, pen.th, pen.f, v, n, at.obstacles),
    );
    grow(at.content, label);
    hits.push({ id: v.id, disc: n, label });
  }
  return hits.reverse();
}

/** A meeting's members around their lead: disc, Clawd and name chip. Each
 *  hit names the member and its lead (whose panel it opens). */
function drawMembers(pen: Pen, v: AgentView, marks: SceneMarks, at: Placing, hits: Hit[]) {
  const lead = pen.nodes.get(`a${v.id}`);
  for (const s of v.subagents) {
    const n = pen.nodes.get(`s${s.id}`);
    if (!n) continue;
    const selected = v.id === marks.selectedId && marks.selectedMember === s.id;
    // One line, on the side away from the lead, so chips never cover it.
    const above = !!lead && n.y < lead.y - 4;
    const chip = pen.fade([`s${s.id}`], () => drawMember(pen, v, s, n, { selected, above }));
    at.obstacles.push(chip);
    grow(at.content, chip);
    hits.push({ id: v.id, member: s.id, disc: n, label: chip });
  }
}

function drawMember(
  pen: Pen,
  v: AgentView,
  s: AgentView['subagents'][number],
  n: SimNode,
  at: { selected: boolean; above: boolean },
): Box {
  const { ctx, th, f } = pen;
  const subColor = lighten(colorOf(v), 0.3);
  const rim = { shape: 'single' as const, spin: 0, still: f.calm };
  drawNodeDisc(ctx, th, n.x, n.y, n.r, subColor, s.kind, f.t, at.selected, false, rim);
  const scale = n.r / 16;
  const pose = poseFor(s.kind, s.id, f.t, f.calm);
  clawdAt(ctx, f, n.x, n.y + clawdHeight(scale, f.dpr) / 2, scale, subColor, pose);
  worldTransform(ctx, f);
  const top = at.above ? n.y - n.r - 26 : n.y + n.r + 6;
  return drawChip(ctx, th, n.x, top, clip(s.label, NAME_CHARS), subColor, s.kind);
}

function seeThrough(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save();
  ctx.globalAlpha *= 0.45;
  draw();
  ctx.restore();
}

/** The agent a dragged one would hand its answer to: a ring and what
 *  dropping does. */
function drawDropRing(pen: Pen, n: SimNode, from: AgentView | undefined) {
  const { ctx, th } = pen;
  // In the colour of the one you carry, and saying whose answer it gets.
  const color = from ? colorOf(from) : th.accent;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.r + 9, 0, Math.PI * 2);
  ctx.stroke();
  setFont(ctx, 600, 11);
  ctx.fillStyle = th.ink;
  ctx.textAlign = 'center';
  const text = from
    ? `Soltá para pasarle la última respuesta de ${clip(from.name, NAME_CHARS)}`
    : 'Soltá para pasarle la última respuesta';
  ctx.fillText(text, n.x, n.y - n.r - 16);
  ctx.restore();
}

/** What the eyes can turn to this frame: the pointer and who celebrates. */
function gazeOf(pen: Pen, list: AgentView[], life: ClawdLife): GazeContext {
  const party = list.find((v) => life.burst(v.id, pen.f.now) !== null);
  const at = party ? pen.nodes.get(`a${party.id}`) : undefined;
  return {
    pointer: pen.f.pointer ?? null,
    near: GAZE_NEAR_PX / pen.f.cam.zoom,
    celebrant: party && at ? { id: party.id, at } : null,
    vos: VOS,
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
    ...poseFor(v.kind, v.id, f.t, f.calm),
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
  if (life.glancing(f.now) && !pose.sleep) pose.blink = true;
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
  const nod = life.nod(v.id, f.now);
  if (nod !== null) {
    const m = nodMotion(nod);
    lift += m.lift;
    if (m.blink) pose.blink = true;
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
  at: { selected: boolean; pulsing: boolean; index: number; gaze: GazeContext },
  life: ClawdLife,
): void {
  const color = colorOf(v);
  ctx.save();
  ctx.globalAlpha *= v.kind === 'idle' ? 0.75 : 1;
  // Maximum effort: a flame around the bubble (the sweat is on Clawd).
  if (!f.calm && effortMarks(effortLevel(v.effort ?? v.runEffort)) === 3) {
    drawEffortFlame(ctx, n.x, n.y, n.r, f.t + v.id);
  }
  drawNodeDisc(ctx, th, n.x, n.y, n.r, color, v.kind, f.t, at.selected, at.pulsing, {
    shape: lookOf(v).rim,
    spin: f.calm ? 0 : f.t + v.id,
    still: f.calm,
  });
  // Clawd fills his disc, as in the preview (the disc grows with activity).
  const scale = n.r / 15;
  const { pose, lift } = livePose(v, f, life, at.index);
  // Eyes: to whoever celebrates, the pointer nearby, or "Vos" (not in calm).
  const target =
    f.calm || pose.sleep
      ? null
      : gazeTarget(at.gaze, { id: v.id, at: n, waits: v.kind === 'needs' });
  if (target) pose.look = lookToward(n, target);
  const foot = n.y + clawdHeight(scale, f.dpr) / 2 - lift;
  clawdAt(ctx, f, n.x, foot, scale, color, pose);
  worldTransform(ctx, f);
  const head = foot - clawdHeight(scale * f.cam.zoom, f.dpr) / f.cam.zoom;
  // Calm mode: the dots stay still (still saying it thinks).
  if (v.kind === 'think') drawThinkDots(ctx, th, n.x, head, f.calm ? 0 : f.t);
  if (pose.sleep && !f.calm) drawZ(ctx, th, n.x + 10, head, f.t + v.id);
  const badge = Math.max(7, n.r * 0.18);
  if (v.kind === 'needs') drawAlertBadge(ctx, th, n.x + n.r * 0.72, n.y - n.r * 0.72, badge);
  if (v.kind === 'done') drawCheckBadge(ctx, th, n.x + n.r * 0.72, n.y - n.r * 0.72, badge);
  ctx.restore();
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

/** What it asks, for the pill on its line to "Vos": the command a
 *  permission would run, or its "te toca", clipped. */
function askOf(v: AgentView): string | undefined {
  const p = v.permission;
  if (!p) return v.yourTurn ? clip(v.yourTurn, 40) : undefined;
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
