import { liveFileLinks } from '../office/behaviors/fileLinksStore.js';
import type { AgentView } from './agentViews.js';
import { GAZE_HOLD_MS } from './clawdGaze.js';
import type { ClawdLife } from './clawdLife.js';
import {
  type Bounds,
  type Camera,
  centerOn,
  isVisible,
  panBy,
  type Pt,
  toScreen,
  toWorld,
} from './graphCamera.js';
import { type GraphTheme, readTheme } from './graphDraw.js';
import { drawMinimap, MINIMAP, minimapToWorld } from './graphExtras.js';
import {
  applyWheel,
  pinchStep,
  wheelIntent,
  type WheelLike,
  WheelStream,
} from './graphGestures.js';
import { type Box, type GraphTarget, hitTest } from './graphHit.js';
import { focusOf, HoverDwell, type HoverTarget } from './graphHover.js';
import { mostUrgent } from './graphPick.js';
import { setPin } from './graphPins.js';
import { type Grab, type PointerHost, PointerTracker } from './graphPointers.js';
import { CameraRig } from './graphRig.js';
import { drawScene, edgesOf, layout, type SceneOut, VOS, WORLD } from './graphScene.js';
import { type SimNode, stepGraph } from './graphSim.js';

/** Close-ups show from this zoom and hide below the lower one (no flicker). */
const DETAIL_ON = 1.4;
const DETAIL_OFF = 1.25;
/** Frame time that, sustained, turns decorative effects off. */
const SLOW_FRAME_MS = 50;
const SLOW_FRAMES = 240;
/** Room the bottom toolbar takes over the canvas. */
const TOOLBAR_CLEARANCE_PX = 64;
/** A double click comes this close (at least). */
const DOUBLE_CLICK_ZOOM = 1.8;
const VOS_ZOOM = 1.5;
/** How long focusOn waits for an agent that is not drawn yet. */
const FOCUS_WAIT_MS = 2000;

/** An agent picked on the graph, or one member of its meeting. */
export interface GraphSelection {
  id: number;
  member?: number;
}

export interface GraphInputs {
  views: AgentView[];
  selected: GraphSelection | null;
  calm: boolean;
  /** Light or dark (the canvas re-reads the color tokens when it changes). */
  theme: string;
  /** CSS variable of the backdrop (the hour of the day). */
  tint: string;
  life: ClawdLife;
  /** A click picked this (null: the background). `repeat`: the second click
   *  of a double click (it centred; it should not count as a new pick). */
  onSelect: (selection: GraphSelection | null, repeat: boolean) => void;
  /** Sustained slow frames: effects went off; tell the user. */
  onSlow: () => void;
  /** Whose camera this is (the workspace on screen): each keeps its own. */
  cameraKey: string;
  /** The mouse rested on an agent or a member (null: it left). */
  onHover?: (target: HoverTarget | null) => void;
  /** After each frame: what follows the graph on screen (cards) moves. */
  onFrame?: () => void;
  /** The mouse came onto an agent's request pill, or a click hit it: it
   *  grows into its actions. */
  onPill?: (id: number, how: 'hover' | 'click') => void;
  /** Right click, or a finger held still: the menu of what is there. */
  onMenu?: (target: GraphTarget | null, at: Pt) => void;
  /** An agent dragged and dropped on another one's disc (`toId`). */
  onDrop?: (fromId: number, toId: number) => void;
  /** The camera started (id) or stopped (null) going along with an agent. */
  onFollow?: (id: number | null) => void;
}

/** What the page can ask of the graph (buttons, keys, overlays). */
export interface GraphControls {
  zoomBy: (factor: number) => void;
  fitAll: () => void;
  panBy: (dx: number, dy: number) => void;
  /** Where an agent (or one of its members) is on screen: centre and radius
   *  in CSS px, or null when it is not on the graph. */
  screenOf: (id: number, member?: number) => { x: number; y: number; r: number } | null;
  /** Where an agent's request pill (on its line to "Vos") is on screen. */
  pillOf: (id: number) => Box | null;
  /** Bring an agent (or member) into view if it is out of frame; one that is
   *  not drawn yet (a workspace switching) is waited for a moment. */
  focusOn: (id: number, member?: number) => void;
  /** Go along with an agent ("Seguir"); null stops. Moving the view by hand
   *  stops it too. */
  follow: (id: number | null) => void;
  /** Centre an agent (or member) and come at least this close (default:
   *  as a double click does). */
  centerOn: (id: number, member?: number, zoom?: number) => void;
  /** Esc while dragging: put it back, nothing dropped. false: no drag. */
  cancelDrag: () => boolean;
}

/** Each workspace's zoom and position, kept while the office is open (also
 *  across switching to the board and back). */
const savedCameras = new Map<string, { cam: Camera; autoFit: boolean }>();

const nodeKey = (g: Grab) => (g.member !== undefined ? `s${g.member}` : `a${g.id}`);

/**
 * The graph's canvas: simulation, camera, gestures (pointerTracker), the
 * minimap and the slow-PC brake. The hook (useGraphCanvas) owns its
 * lifetime and feeds it DOM events.
 */
export class GraphStage implements PointerHost {
  readonly rig = new CameraRig((id) => this.inputs().onFollow?.(id));
  readonly pointers = new PointerTracker(this);
  private readonly wheelStream = new WheelStream();
  private readonly nodes = new Map<string, SimNode>();
  private out: SceneOut | null = null;
  private minimap: Box | null = null;
  private lastMinimap: Box | null = null;
  private held: { node: string; at: Pt } | null = null;
  private detail = false;
  private th: GraphTheme = readTheme();
  private themeShown: string;
  private stageTint: string;
  private stageColor: string;
  private cameraKey: string;
  private dpr = 1;
  private t = 0;
  private last = performance.now();
  private slow = false;
  private readonly frameTimes: number[] = [];
  /** The mouse over the canvas (no button), for the hover card. */
  private mouse: Pt | null = null;
  private mouseMovedAt = -Infinity;
  private readonly dwell = new HoverDwell();
  private hover: HoverTarget | null = null;
  private pillHover: number | null = null;
  /** While dragging an agent: the one under it that would get its answer. */
  private dropOn: number | null = null;
  /** focusOn's node, until it is drawn (or the wait runs out). */
  private pendingFocus: { key: string; until: number } | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly inputs: () => GraphInputs;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, inputs: () => GraphInputs) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.inputs = inputs;
    const now = inputs();
    this.themeShown = now.theme;
    this.stageTint = now.tint;
    this.stageColor = this.readStage();
    this.cameraKey = now.cameraKey;
    this.restoreCamera(now.cameraKey);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.rig.view = { w: rect.width, h: rect.height };
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  private readStage(): string {
    return getComputedStyle(document.documentElement).getPropertyValue(this.inputs().tint).trim();
  }

  saveCamera(): void {
    savedCameras.set(this.cameraKey, { cam: this.rig.cam, autoFit: this.rig.autoFit });
  }

  /** Put the camera of `key` on: its saved one, else fit the new content. */
  private restoreCamera(key: string): void {
    const saved = savedCameras.get(key);
    this.cameraKey = key;
    this.rig.follow(null);
    this.rig.target = null;
    this.rig.autoFit = saved?.autoFit ?? true;
    if (saved) this.rig.cam = saved.cam;
  }

  private trackSpeed(ms: number): void {
    // A hidden tab coming back, or one long stall (a screenshot, a GC), is not
    // a slow PC: only a sustained run of slow frames counts.
    if (this.slow || ms > 200 || document.visibilityState !== 'visible') return;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > SLOW_FRAMES) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (this.frameTimes.length === SLOW_FRAMES && avg > SLOW_FRAME_MS) {
      this.slow = true;
      console.warn('[Oficina] Grafo lento: efectos decorativos apagados');
      this.inputs().onSlow();
    }
  }

  /** What changed outside since the last frame: workspace, theme, hour, calm. */
  private sync(inp: GraphInputs): void {
    if (inp.cameraKey !== this.cameraKey) {
      this.saveCamera();
      this.restoreCamera(inp.cameraKey);
    }
    if (inp.theme !== this.themeShown || inp.tint !== this.stageTint) {
      this.themeShown = inp.theme;
      this.stageTint = inp.tint;
      this.th = readTheme();
      this.stageColor = this.readStage();
    }
    this.rig.calm = inp.calm;
  }

  frame(now: number): void {
    const ms = now - this.last;
    this.last = now;
    this.trackSpeed(ms);
    const dt = Math.min(0.05, ms / 1000);
    this.t += dt;
    const inp = this.inputs();
    this.sync(inp);
    layout(this.nodes, inp.views);
    if (this.held) this.holdNode(this.held);
    this.focusPending(now);
    this.pointers.tick(now);
    // What you hold pulls nobody: dragging a member leaves its lead in place.
    const held = this.held?.node;
    const edges = edgesOf(inp.views).filter((e) => e.a !== held && e.b !== held);
    stepGraph(this.nodes, edges, dt, { w: WORLD.w, h: WORLD.h, margin: 48 }, held);
    const wall = Date.now();
    // Fit above the toolbar, which floats over the bottom of the canvas.
    const { w, h } = this.rig.view;
    const followed =
      this.rig.following !== null ? this.nodes.get(`a${this.rig.following}`) : undefined;
    this.rig.step(this.out?.content ?? null, { w, h: h - TOOLBAR_CLEARANCE_PX }, followed);
    const cam = this.rig.cam;
    if (!this.detail && cam.zoom >= DETAIL_ON) this.detail = true;
    else if (this.detail && cam.zoom < DETAIL_OFF) this.detail = false;
    const f = { dpr: this.dpr, t: this.t, now: wall, cam, view: this.rig.view };
    const scene = {
      ...f,
      calm: inp.calm || this.slow,
      detail: this.detail,
      stage: this.stageColor,
      // The Clawds look at the pointer a moment after it moves.
      pointer:
        this.mouse && now - this.mouseMovedAt < GAZE_HOLD_MS ? toWorld(cam, this.mouse) : null,
    };
    const marks = {
      selectedId: inp.selected?.id ?? null,
      selectedMember: inp.selected?.member,
      focus: this.updateHover(inp, now),
      dropTarget: this.dropOn,
    };
    this.out = drawScene(this.ctx, this.th, scene, inp.views, this.nodes, marks, inp.life);
    this.minimap = drawMinimapIfNeeded(
      this.ctx,
      this.th,
      this.out,
      cam,
      this.rig.view,
      inp.views,
      this.nodes,
    );
    if (this.minimap) this.lastMinimap = this.minimap;
    inp.onFrame?.();
  }

  private focusPending(now: number): void {
    const want = this.pendingFocus;
    if (!want) return;
    const n = this.nodes.get(want.key);
    if (n) this.rig.reveal(n, n.r * this.rig.cam.zoom);
    if (n || now > want.until) this.pendingFocus = null;
  }

  /** The mouse moved over the canvas without a button (null: it left). */
  pointAt(p: Pt | null): void {
    this.mouse = p;
    if (p) this.mouseMovedAt = performance.now();
  }

  /** Who the mouse rests on (after the dwell) and what stays crisp then. */
  private updateHover(inp: GraphInputs, now: number): ReadonlySet<string> | null {
    const t = this.mouse && !this.pointers.busy ? this.targetAt(this.mouse) : null;
    const next = this.dwell.update(
      t?.type === 'agent' ? { id: t.id, member: t.member } : null,
      now,
    );
    if (next !== this.hover) {
      this.hover = next;
      inp.onHover?.(next);
    }
    // A pill grows at once: it is a target you aim at, not a place you rest.
    const pill = t?.type === 'pill' ? t.id : null;
    if (pill !== this.pillHover) {
      this.pillHover = pill;
      if (pill !== null) inp.onPill?.(pill, 'hover');
    }
    return next ? focusOf(inp.views, next, liveFileLinks()) : null;
  }

  private holdNode(h: { node: string; at: Pt }): void {
    const n = this.nodes.get(h.node);
    if (!n) return;
    n.x = n.ax = h.at.x;
    n.y = n.ay = h.at.y;
    n.vx = n.vy = 0;
  }

  // --- gestures (PointerHost) ---

  targetAt(p: Pt): GraphTarget | null {
    return this.out ? hitTest(this.out, this.rig.cam, p, this.minimap) : null;
  }

  pan(dx: number, dy: number): void {
    this.rig.moveTo(panBy(this.rig.cam, dx, dy));
  }

  pinch(prev: [Pt, Pt], next: [Pt, Pt]): void {
    this.rig.moveTo(pinchStep(this.rig.cam, prev, next));
  }

  wheel(e: WheelLike, p: Pt, now: number): void {
    const notch = this.wheelStream.isNotch(e, now);
    this.rig.moveTo(applyWheel(this.rig.cam, wheelIntent(e, p, notch)));
  }

  minimapTo(p: Pt): void {
    // The frame you drag may vanish (everyone fits now): keep its last place.
    const box = this.minimap ?? this.lastMinimap;
    if (!box || !this.out) return;
    const world = minimapToWorld(box, this.out.content, p.x, p.y);
    this.rig.moveTo(centerOn(this.rig.cam, world, this.rig.view));
  }

  hold(grab: Grab, p: Pt): void {
    // Dragging an agent stops fitting and following (it would run away).
    this.rig.moveTo(this.rig.cam);
    this.held = { node: nodeKey(grab), at: toWorld(this.rig.cam, p) };
    this.dropOn = grab.member === undefined ? this.dropTargetAt(p, grab.id) : null;
  }

  /** The agent whose disc (not its label) is under p and could get a
   *  dragged agent's answer: one with its terminal in the office. */
  private dropTargetAt(p: Pt, self: number): number | null {
    if (!this.out) return null;
    const w = toWorld(this.rig.cam, p);
    const hit = this.out.hits.find(
      (h) =>
        h.member === undefined &&
        h.id !== self &&
        Math.hypot(h.disc.x - w.x, h.disc.y - w.y) <= h.disc.r,
    );
    const v = hit ? this.inputs().views.find((x) => x.id === hit.id) : undefined;
    return v?.hasTerminal ? v.id : null;
  }

  release(grab: Grab, keep: boolean): void {
    const to = this.dropOn;
    this.dropOn = null;
    // Dropped on another agent: it gets its answer, and it goes back home.
    if (keep && to !== null && grab.member === undefined) {
      this.held = null;
      this.inputs().onDrop?.(grab.id, to);
      return;
    }
    // An agent stays where you drop it; a member goes back to its seat.
    if (keep && this.held && grab.member === undefined) {
      const key = this.inputs().views.find((v) => v.id === grab.id)?.key;
      if (key) setPin(key, this.held.at);
    }
    this.held = null;
  }

  click(target: GraphTarget | null, p: Pt, repeat: boolean): void {
    const { views, onSelect } = this.inputs();
    const zoom = this.rig.cam.zoom;
    switch (target?.type) {
      case 'agent':
        if (repeat) this.centerNode(nodeKey(target), Math.max(zoom, DOUBLE_CLICK_ZOOM));
        onSelect({ id: target.id, member: target.member }, repeat);
        return;
      case 'arrow':
        this.centerNode(`a${target.id}`, zoom);
        onSelect({ id: target.id }, repeat);
        return;
      case 'vos':
        this.clickVos(views, repeat);
        return;
      case 'minimap':
        if (this.out && this.minimap)
          this.rig.centerOn(minimapToWorld(this.minimap, this.out.content, p.x, p.y));
        return;
      case 'pill':
        this.inputs().onPill?.(target.id, 'click');
        return;
      case 'passive':
        // Drawn things are not the background: the panel stays.
        return;
      default:
        if (!repeat) onSelect(null, false);
    }
  }

  longPress(target: GraphTarget | null, p: Pt): void {
    this.inputs().onMenu?.(target, p);
  }

  /** A right click at p (screen px). */
  menuAt(p: Pt): void {
    this.inputs().onMenu?.(this.targetAt(p), p);
  }

  /** "Vos" opens the most urgent wait (as Alt+N); a double click centres it;
   *  with nobody waiting a click does nothing. */
  private clickVos(views: AgentView[], repeat: boolean): void {
    if (repeat) {
      this.rig.centerOn(VOS, Math.max(this.rig.cam.zoom, VOS_ZOOM));
      return;
    }
    const id = mostUrgent(views);
    if (id !== null) this.inputs().onSelect({ id }, false);
  }

  private centerNode(key: string, zoom: number): void {
    const n = this.nodes.get(key);
    if (n) this.rig.centerOn(n, zoom);
  }

  // --- what the page can ask (buttons, keys) ---

  controls(): GraphControls {
    return {
      zoomBy: (factor) => this.rig.zoomBy(factor),
      fitAll: () => this.rig.fit(),
      panBy: (dx, dy) => this.pan(dx, dy),
      cancelDrag: () => {
        if (!this.held) return false;
        this.pointers.abort();
        this.held = null;
        this.dropOn = null;
        return true;
      },
      focusOn: (id, member) => {
        // Opening someone else ends going along with another.
        if (this.rig.following !== id) this.rig.follow(null);
        const key = member !== undefined ? `s${member}` : `a${id}`;
        this.pendingFocus = { key, until: performance.now() + FOCUS_WAIT_MS };
      },
      follow: (id) => this.rig.follow(id),
      centerOn: (id, member, zoom = DOUBLE_CLICK_ZOOM) =>
        this.centerNode(nodeKey({ id, member }), Math.max(this.rig.cam.zoom, zoom)),
      pillOf: (id) => {
        const box = this.out?.pills.find((x) => x.id === id)?.box;
        if (!box) return null;
        const at = toScreen(this.rig.cam, box);
        const z = this.rig.cam.zoom;
        return { x: at.x, y: at.y, w: box.w * z, h: box.h * z };
      },
      screenOf: (id, member) => {
        const n = this.nodes.get(member !== undefined ? `s${member}` : `a${id}`);
        if (!n) return null;
        const at = toScreen(this.rig.cam, n);
        return { x: at.x, y: at.y, r: n.r * this.rig.cam.zoom };
      },
    };
  }
}

/** The minimap shows only when part of the graph is out of view. */
function drawMinimapIfNeeded(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  out: SceneOut,
  cam: Camera,
  view: { w: number; h: number },
  views: AgentView[],
  nodes: Map<string, SimNode>,
): Box | null {
  const c = out.content;
  const allInView =
    isVisible(cam, view, { x: c.minX, y: c.minY }) &&
    isVisible(cam, view, { x: c.maxX, y: c.maxY });
  if (allInView) return null;
  const box = {
    x: view.w - MINIMAP.w - MINIMAP.margin,
    y: view.h - MINIMAP.h - 84,
    w: MINIMAP.w,
    h: MINIMAP.h,
  };
  const tl = toWorld(cam, { x: 0, y: 0 });
  const br = toWorld(cam, { x: view.w, y: view.h });
  const shown: Bounds = { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
  const dots = views.flatMap((v) => {
    const n = nodes.get(`a${v.id}`);
    return n ? [{ x: n.x, y: n.y, color: th.muted, needs: v.kind === 'needs' }] : [];
  });
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  drawMinimap(ctx, th, box, c, dots, shown);
  return box;
}
