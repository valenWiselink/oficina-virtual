import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

import type { AgentView } from './agentViews.js';
import type { ClawdLife } from './clawdLife.js';
import {
  type Bounds,
  type Camera,
  centerOn,
  fitCamera,
  isVisible,
  panBy,
  toWorld,
  zoomAt,
} from './graphCamera.js';
import { readTheme } from './graphDraw.js';
import { drawMinimap, MINIMAP, minimapToWorld } from './graphExtras.js';
import { setPin } from './graphPins.js';
import { drawScene, edgesOf, layout, type SceneOut, VOS, WORLD } from './graphScene.js';
import { type SimNode, stepGraph } from './graphSim.js';

/** Close-ups show from this zoom and hide below the lower one (no flicker). */
const DETAIL_ON = 1.4;
const DETAIL_OFF = 1.25;
/** A drag shorter than this is a click. */
const CLICK_SLOP_PX = 4;
/** Frame time that, sustained, turns decorative effects off. */
const SLOW_FRAME_MS = 50;
/** Room the bottom toolbar takes over the canvas. */
const TOOLBAR_CLEARANCE_PX = 64;
const SLOW_FRAMES = 240;

interface GraphInputs {
  views: AgentView[];
  selectedId: number | null;
  calm: boolean;
  /** Light or dark (the canvas re-reads the color tokens when it changes). */
  theme: string;
  /** CSS variable of the backdrop (the hour of the day). */
  tint: string;
  life: ClawdLife;
  onSelect: (id: number | null) => void;
  /** Sustained slow frames: effects went off; tell the user. */
  onSlow: () => void;
  /** Whose camera this is (the workspace on screen): each keeps its own. */
  cameraKey: string;
}

/** Each workspace's zoom and position, kept while the office is open (also
 *  across switching to the board and back). */
const savedCameras = new Map<string, { cam: Camera; autoFit: boolean }>();

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box | null, x: number, y: number) =>
  !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Ease the camera toward a target (centre, fit), a little each frame. */
function approach(cam: Camera, target: Camera, k: number): Camera {
  return {
    x: cam.x + (target.x - cam.x) * k,
    y: cam.y + (target.y - cam.y) * k,
    zoom: cam.zoom + (target.zoom - cam.zoom) * k,
  };
}

/**
 * The graph's canvas loop: simulation, camera, gestures (wheel zoom toward
 * the mouse, drag to pan, click, double click to centre), minimap and the
 * slow-PC brake. Returns the buttons' actions.
 */
export function useGraphCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  inputs: GraphInputs,
): { zoomBy: (factor: number) => void; fitAll: () => void } {
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const api = useRef<{ zoomBy: (factor: number) => void; fitAll: () => void }>({
    zoomBy: () => {},
    fitAll: () => {},
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let th = readTheme();
    let themeShown = inputsRef.current.theme;
    const nodes = new Map<string, SimNode>();
    let cam: Camera = { x: 0, y: 0, zoom: 1 };
    let target: Camera | null = null;
    let autoFit = true;
    let cameraKey = inputsRef.current.cameraKey;
    /** Put the camera of `key` on: its saved one, else fit the new content. */
    const restoreCamera = (key: string) => {
      const saved = savedCameras.get(key);
      cameraKey = key;
      target = null;
      autoFit = saved?.autoFit ?? true;
      if (saved) cam = saved.cam;
    };
    const saveCamera = () => savedCameras.set(cameraKey, { cam, autoFit });
    restoreCamera(cameraKey);
    let detail = false;
    let out: SceneOut | null = null;
    let minimap: Box | null = null;
    let view = { w: 0, h: 0 };
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let slow = false;
    const frameTimes: number[] = [];
    /** The agent being dragged and where the pointer has it. */
    let held: { id: number; at: { x: number; y: number } } | null = null;
    const holdNode = (h: { id: number; at: { x: number; y: number } }) => {
      const n = nodes.get(`a${h.id}`);
      if (!n) return;
      n.x = n.ax = h.at.x;
      n.y = n.ay = h.at.y;
      n.vx = n.vy = 0;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      view = { w: rect.width, h: rect.height };
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const stage = () =>
      getComputedStyle(document.documentElement).getPropertyValue(inputsRef.current.tint).trim();
    let stageColor = stage();
    let stageTint = inputsRef.current.tint;

    const trackSpeed = (ms: number) => {
      // A hidden tab coming back, or one long stall (a screenshot, a GC), is not
      // a slow PC: only a sustained run of slow frames counts.
      if (slow || ms > 200 || document.visibilityState !== 'visible') return;
      frameTimes.push(ms);
      if (frameTimes.length > SLOW_FRAMES) frameTimes.shift();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      if (frameTimes.length === SLOW_FRAMES && avg > SLOW_FRAME_MS) {
        slow = true;
        console.warn('[Oficina] Grafo lento: efectos decorativos apagados');
        inputsRef.current.onSlow();
      }
    };

    const frame = (now: number) => {
      const ms = now - last;
      last = now;
      trackSpeed(ms);
      const dt = Math.min(0.05, ms / 1000);
      t += dt;
      const { views, selectedId, calm, life, tint, theme } = inputsRef.current;
      if (inputsRef.current.cameraKey !== cameraKey) {
        saveCamera();
        restoreCamera(inputsRef.current.cameraKey);
      }
      if (theme !== themeShown) {
        themeShown = theme;
        th = readTheme();
        stageColor = stage();
      }
      if (tint !== stageTint) {
        stageTint = tint;
        stageColor = stage();
      }
      layout(nodes, views);
      if (held) holdNode(held);
      stepGraph(nodes, edgesOf(views), dt, { w: WORLD.w, h: WORLD.h, margin: 48 });
      const wall = Date.now();
      life.observe(views, wall);
      // Fit above the toolbar, which floats over the bottom of the canvas.
      if (autoFit && out)
        target = fitCamera(out.content, { w: view.w, h: view.h - TOOLBAR_CLEARANCE_PX }, 60);
      if (target) {
        cam = approach(cam, target, autoFit ? 0.08 : 0.18);
        if (Math.abs(cam.zoom - target.zoom) < 0.001 && Math.abs(cam.x - target.x) < 0.5) {
          cam = target;
          if (!autoFit) target = null;
        }
      }
      if (!detail && cam.zoom >= DETAIL_ON) detail = true;
      else if (detail && cam.zoom < DETAIL_OFF) detail = false;
      out = drawScene(
        ctx,
        th,
        { dpr, t, now: wall, cam, view, calm: calm || slow, detail, stage: stageColor },
        views,
        nodes,
        selectedId,
        life,
      );
      minimap = drawMinimapIfNeeded(ctx, th, out, cam, view, views, nodes);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const local = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const hitAt = (sx: number, sy: number): number | 'vos' | null => {
      if (!out) return null;
      const arrow = out.arrows.find((a) => inBox(a.box, sx, sy));
      if (arrow) return arrow.id;
      const w = toWorld(cam, { x: sx, y: sy });
      if (inBox(out.vos, w.x, w.y)) return 'vos';
      for (const hit of out.hits) {
        if (Math.hypot(hit.disc.x - w.x, hit.disc.y - w.y) <= hit.disc.r + 6) return hit.id;
        if (hit.label && inBox(hit.label, w.x, w.y)) return hit.id;
      }
      return null;
    };
    /** The agent under a point (its disc or label), for dragging it. */
    const agentAt = (sx: number, sy: number): number | null => {
      if (!out || out.arrows.some((a) => inBox(a.box, sx, sy))) return null;
      const w = toWorld(cam, { x: sx, y: sy });
      for (const hit of out.hits) {
        if (Math.hypot(hit.disc.x - w.x, hit.disc.y - w.y) <= hit.disc.r + 6) return hit.id;
        if (hit.label && inBox(hit.label, w.x, w.y)) return hit.id;
      }
      return null;
    };
    const centerAgent = (id: number, zoom: number) => {
      const n = nodes.get(`a${id}`);
      if (!n) return;
      autoFit = false;
      target = centerOn(cam, n, view, zoom);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit = false;
      target = null;
      cam = zoomAt(cam, local(e), Math.exp(-e.deltaY * 0.0015));
    };
    let press: { x: number; y: number; dragging: boolean; agent: number | null } | null = null;
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      press = { ...p, dragging: false, agent: agentAt(p.x, p.y) };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (!press) {
        const over = inBox(minimap, p.x, p.y) || hitAt(p.x, p.y) !== null;
        canvas.style.cursor = over ? 'pointer' : 'grab';
        return;
      }
      if (!press.dragging && Math.hypot(p.x - press.x, p.y - press.y) < CLICK_SLOP_PX) return;
      press.dragging = true;
      canvas.style.cursor = 'grabbing';
      autoFit = false;
      target = null;
      if (press.agent !== null) {
        // Dragging an agent moves it (and it stays where you drop it).
        held = { id: press.agent, at: toWorld(cam, p) };
      } else {
        cam = panBy(cam, e.movementX, e.movementY);
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = local(e);
      const wasDrag = press?.dragging;
      press = null;
      canvas.style.cursor = 'grab';
      if (held) {
        const key = inputsRef.current.views.find((v) => v.id === held!.id)?.key;
        if (key) setPin(key, held.at);
        held = null;
      }
      if (wasDrag) return;
      if (minimap && inBox(minimap, p.x, p.y) && out) {
        autoFit = false;
        target = centerOn(cam, minimapToWorld(minimap, out.content, p.x, p.y), view);
        return;
      }
      const hit = hitAt(p.x, p.y);
      const { views, onSelect } = inputsRef.current;
      if (hit === 'vos') {
        const waiting = views.find((v) => v.kind === 'needs');
        onSelect(waiting ? waiting.id : null);
      } else {
        if (hit !== null && out?.arrows.some((a) => a.id === hit)) centerAgent(hit, cam.zoom);
        onSelect(hit);
      }
    };
    const onDouble = (e: MouseEvent) => {
      const p = local(e);
      const hit = hitAt(p.x, p.y);
      if (typeof hit === 'number') centerAgent(hit, Math.max(cam.zoom, 1.8));
      else if (hit === 'vos') {
        autoFit = false;
        target = centerOn(cam, VOS, view, Math.max(cam.zoom, 1.5));
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDouble);

    api.current = {
      zoomBy: (factor) => {
        autoFit = false;
        target = zoomAt(cam, { x: view.w / 2, y: view.h / 2 }, factor);
      },
      fitAll: () => {
        autoFit = true;
      },
    };

    return () => {
      saveCamera();
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDouble);
    };
  }, [canvasRef]);

  return {
    zoomBy: (factor) => api.current.zoomBy(factor),
    fitAll: () => api.current.fitAll(),
  };
}

/** The minimap shows only when part of the graph is out of view. */
function drawMinimapIfNeeded(
  ctx: CanvasRenderingContext2D,
  th: ReturnType<typeof readTheme>,
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
