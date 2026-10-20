import { describe, expect, it } from 'vitest';

import {
  centerOn,
  edgeArrow,
  FIT_ZOOM_MAX,
  fitCamera,
  isVisible,
  panBy,
  toScreen,
  toWorld,
  ZOOM_MAX,
  zoomAt,
} from '../src/views/graphCamera.js';

const view = { w: 800, h: 600 };

describe('graphCamera', () => {
  it('zooming keeps the point under the mouse still', () => {
    const cam = { x: 100, y: 50, zoom: 1 };
    const mouse = { x: 300, y: 200 };
    const before = toWorld(cam, mouse);
    const after = zoomAt(cam, mouse, 1.5);
    expect(after.zoom).toBeCloseTo(1.5);
    expect(toWorld(after, mouse).x).toBeCloseTo(before.x);
    expect(toWorld(after, mouse).y).toBeCloseTo(before.y);
  });

  it('never zooms past its limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 2.9 }, { x: 0, y: 0 }, 5).zoom).toBe(ZOOM_MAX);
  });

  it('a drag moves the content with the mouse', () => {
    const cam = panBy({ x: 0, y: 0, zoom: 2 }, 100, -40);
    expect(toScreen(cam, { x: 0, y: 0 })).toEqual({ x: 100, y: -40 });
  });

  it('fitting shows everything, centred, without blowing a small graph up', () => {
    const cam = fitCamera({ minX: 0, minY: 0, maxX: 1000, maxY: 400 }, view, 50);
    expect(cam.zoom).toBeCloseTo(0.7);
    expect(isVisible(cam, view, { x: 0, y: 0 })).toBe(true);
    expect(isVisible(cam, view, { x: 1000, y: 400 })).toBe(true);
    const tiny = fitCamera({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, view);
    expect(tiny.zoom).toBe(FIT_ZOOM_MAX);
  });

  it('centres a point (double click)', () => {
    const cam = centerOn({ x: 0, y: 0, zoom: 1 }, { x: 500, y: 500 }, view, 2);
    expect(toScreen(cam, { x: 500, y: 500 })).toEqual({ x: 400, y: 300 });
  });

  it('points an edge arrow at an off-screen agent from the border', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const right = edgeArrow(cam, view, { x: 2000, y: 300 }, 20);
    expect(right.x).toBeCloseTo(780);
    expect(right.y).toBeCloseTo(300);
    expect(right.angle).toBeCloseTo(0);
    const above = edgeArrow(cam, view, { x: 400, y: -900 }, 20);
    expect(above.y).toBeCloseTo(20);
  });
});
