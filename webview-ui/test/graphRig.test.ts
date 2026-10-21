import { describe, expect, it } from 'vitest';

import { toScreen } from '../src/views/graphCamera.js';
import { CameraRig } from '../src/views/graphRig.js';

const view = { w: 800, h: 600 };
const content = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };

function rig(onFollow?: (id: number | null) => void) {
  const r = new CameraRig(onFollow);
  r.view = view;
  r.autoFit = false;
  return r;
}

describe('CameraRig', () => {
  it('glides to where it goes; in calm mode it jumps', () => {
    const glide = rig();
    glide.centerOn({ x: 1000, y: 1000 });
    expect(glide.cam.x).toBe(0);
    glide.step(null, view, undefined);
    expect(glide.cam.x).toBeGreaterThan(0);
    expect(glide.cam.x).toBeLessThan(600);

    const calm = rig();
    calm.calm = true;
    calm.centerOn({ x: 1000, y: 1000 });
    expect(toScreen(calm.cam, { x: 1000, y: 1000 })).toEqual({ x: 400, y: 300 });
  });

  it('fitting in calm mode lands in one frame', () => {
    const r = rig();
    r.calm = true;
    r.fit();
    r.step(content, view, undefined);
    const fitted = r.cam;
    r.step(content, view, undefined);
    expect(r.cam).toEqual(fitted);
    expect(toScreen(r.cam, { x: 500, y: 300 }).x).toBeCloseTo(400);
  });

  it('follows an agent until you move the view by hand', () => {
    const told: Array<number | null> = [];
    const r = rig((id) => told.push(id));
    r.calm = true;
    r.follow(4);
    r.step(content, view, { x: 700, y: 200 });
    expect(toScreen(r.cam, { x: 700, y: 200 })).toEqual({ x: 400, y: 300 });
    r.step(content, view, { x: 720, y: 260 });
    expect(toScreen(r.cam, { x: 720, y: 260 })).toEqual({ x: 400, y: 300 });
    r.moveTo({ ...r.cam, x: r.cam.x + 50 });
    expect(r.following).toBeNull();
    expect(told).toEqual([4, null]);
  });

  it('stops following when the agent is gone, and when you fit everyone', () => {
    const r = rig();
    r.follow(4);
    r.step(content, view, undefined);
    expect(r.following).toBeNull();
    r.follow(5);
    r.fit();
    expect(r.following).toBeNull();
    expect(r.autoFit).toBe(true);
  });

  it('zooming while following keeps following, at the new zoom', () => {
    const r = rig();
    r.calm = true;
    r.follow(4);
    r.zoomBy(2);
    r.step(content, view, { x: 300, y: 300 });
    expect(r.cam.zoom).toBeCloseTo(2);
    expect(r.following).toBe(4);
    expect(toScreen(r.cam, { x: 300, y: 300 })).toEqual({ x: 400, y: 300 });
  });

  it('reveal moves only for what is out of frame', () => {
    const r = rig();
    r.calm = true;
    r.reveal({ x: 100, y: 100 });
    expect(r.cam).toEqual({ x: 0, y: 0, zoom: 1 });
    r.reveal({ x: 2000, y: 100 });
    expect(toScreen(r.cam, { x: 2000, y: 100 })).toEqual({ x: 400, y: 300 });
  });
});
