import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

import type { GraphTarget } from './graphHit.js';
import { type GraphControls, type GraphInputs, GraphStage } from './graphStage.js';

export type { GraphControls, GraphInputs, GraphSelection } from './graphStage.js';

const cursorFor = (t: GraphTarget | null) => (!t || t.type === 'passive' ? 'grab' : 'pointer');

/** Feed the stage the canvas' DOM events; returns the cleanup. */
function attachInput(canvas: HTMLCanvasElement, stage: GraphStage): () => void {
  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    stage.wheel(e as WheelEvent & { wheelDeltaY?: number }, local(e), e.timeStamp);
  };
  const onDown = (e: PointerEvent) => {
    stage.pointers.down(e.pointerId, local(e));
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    if (!stage.pointers.busy) {
      // A finger has no hover: only a mouse or a pen rests on something.
      if (e.pointerType !== 'touch') stage.pointAt(p);
      canvas.style.cursor = cursorFor(stage.targetAt(p));
      return;
    }
    stage.pointers.move(e.pointerId, p);
    canvas.style.cursor = 'grabbing';
  };
  const onUp = (e: PointerEvent) => {
    stage.pointers.up(e.pointerId, local(e), e.timeStamp);
    canvas.style.cursor = 'grab';
  };
  const onCancel = (e: PointerEvent) => stage.pointers.cancel(e.pointerId);
  const onLeave = () => stage.pointAt(null);
  const listeners: Array<[string, (e: never) => void]> = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['pointerleave', onLeave],
  ];
  canvas.addEventListener('wheel', onWheel, { passive: false });
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn as EventListener);
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    for (const [type, fn] of listeners) canvas.removeEventListener(type, fn as EventListener);
  };
}

/**
 * The graph's canvas loop (graphStage.ts: simulation, camera, gestures,
 * minimap, slow-PC brake), mounted on a canvas. Returns what the page can
 * ask of it (buttons, keys).
 */
export function useGraphCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  inputs: GraphInputs,
): GraphControls {
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const api = useRef<GraphControls | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const stage = new GraphStage(canvas, ctx, () => inputsRef.current);
    const observer = new ResizeObserver(() => stage.resize());
    observer.observe(canvas);
    const detach = attachInput(canvas, stage);
    let raf = 0;
    const loop = (now: number) => {
      stage.frame(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    api.current = stage.controls();
    return () => {
      stage.saveCamera();
      cancelAnimationFrame(raf);
      observer.disconnect();
      detach();
      api.current = null;
    };
  }, [canvasRef]);

  return {
    zoomBy: (factor) => api.current?.zoomBy(factor),
    fitAll: () => api.current?.fitAll(),
    panBy: (dx, dy) => api.current?.panBy(dx, dy),
    screenOf: (id, member) => api.current?.screenOf(id, member) ?? null,
  };
}
