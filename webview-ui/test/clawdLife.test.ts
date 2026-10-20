import { describe, expect, it } from 'vitest';

import type { AgentView } from '../src/views/agentViews.js';
import { ClawdLife, isAsleep, SLEEP_AFTER_MS } from '../src/views/clawdLife.js';

const view = (id: number, over: Partial<AgentView> = {}): AgentView => ({
  id,
  name: `A${id}`,
  key: `k${id}`,
  palette: 0,
  hueShift: 0,
  kind: 'work',
  statusText: '',
  subagents: [],
  tasks: [],
  hasTerminal: true,
  ...over,
});
const tasks = (...done: boolean[]) =>
  done.map((d, i) => ({
    subject: `T${i}`,
    status: d ? ('completed' as const) : ('pending' as const),
  }));

describe('ClawdLife', () => {
  it('what is already done at first sight is not celebrated', () => {
    const life = new ClawdLife();
    life.observe([view(1, { tasks: tasks(true, true) })], 0);
    expect(life.burst(1, 10)).toBeNull();
  });

  it('celebrates finishing the whole list; a single task gets a check', () => {
    const life = new ClawdLife();
    life.observe([view(1, { tasks: tasks(false, false) })], 0);
    life.observe([view(1, { tasks: tasks(true, false) })], 100);
    expect(life.check(1, 200)).not.toBeNull();
    expect(life.burst(1, 200)).toBeNull();
    life.observe([view(1, { tasks: tasks(true, true) })], 300);
    expect(life.burst(1, 400)).not.toBeNull();
  });

  it('waits while anyone needs you, then celebrates', () => {
    const life = new ClawdLife();
    const waiting = view(2, { kind: 'needs' });
    life.observe([view(1), waiting], 0);
    life.celebrate(1);
    life.observe([view(1), waiting], 100);
    expect(life.burst(1, 150)).toBeNull();
    life.observe([view(1), view(2)], 200);
    expect(life.burst(1, 250)).not.toBeNull();
  });

  it('celebrates the same agent at most every 2 minutes', () => {
    const life = new ClawdLife();
    life.observe([view(1)], 0);
    life.celebrate(1);
    life.observe([view(1)], 0);
    life.celebrate(1);
    life.observe([view(1)], 60_000);
    expect(life.burst(1, 60_100)).toBeNull();
    life.celebrate(1);
    life.observe([view(1)], 130_000);
    expect(life.burst(1, 130_100)).not.toBeNull();
  });

  it('a click hops it and blinks twice', () => {
    const life = new ClawdLife();
    life.greet(1, 0);
    expect(life.hop(1, 180)).toBeGreaterThan(1.9);
    expect(life.blinking(1, 10)).toBe(true);
    expect(life.hop(1, 1000)).toBe(0);
  });
});

describe('isAsleep', () => {
  it('only without a task, and only by its own record times', () => {
    const now = 100 * 60_000;
    expect(isAsleep(view(1, { kind: 'idle', lastRecordAt: now - SLEEP_AFTER_MS }), now)).toBe(true);
    expect(isAsleep(view(1, { kind: 'done', lastRecordAt: 0 }), now)).toBe(false);
    expect(isAsleep(view(1, { kind: 'idle' }), now)).toBe(false);
    expect(isAsleep(view(1, { kind: 'idle', lastRecordAt: now - 60_000 }), now)).toBe(false);
  });
});

describe('ClawdLife: hello, arrivals, tricks, coffee', () => {
  it('everyone waves when the page opens, one after another', () => {
    const life = new ClawdLife();
    life.observe([view(1), view(2)], 1000);
    expect(life.waving(0, 1000)).toBe(true);
    expect(life.waving(1, 1000)).toBe(false);
    expect(life.waving(1, 1300)).toBe(true);
    expect(life.waving(0, 5000)).toBe(false);
  });

  it('only an agent that shows up later arrives', () => {
    const life = new ClawdLife();
    life.observe([view(1)], 0);
    expect(life.arrival(1, 10)).toBeNull();
    life.observe([view(1), view(2)], 100);
    expect(life.arrival(2, 200)).not.toBeNull();
  });

  it('five quick clicks start a trick, and the next one is another', () => {
    const life = new ClawdLife();
    for (let i = 0; i < 4; i++) life.greet(1, i * 100);
    expect(life.trick(1, 450)).toBeNull();
    life.greet(1, 400);
    const first = life.trick(1, 500)?.trick;
    expect(first).toBeDefined();
    for (let i = 0; i < 5; i++) life.greet(1, 10_000 + i * 100);
    expect(life.trick(1, 10_500)?.trick).not.toBe(first);
  });

  it('slow clicks never add up to a trick', () => {
    const life = new ClawdLife();
    for (let i = 0; i < 6; i++) life.greet(1, i * 1000);
    expect(life.trick(1, 5100)).toBeNull();
  });

  it('counts working time and resets it on a break', () => {
    const life = new ClawdLife();
    life.observe([view(1)], 0);
    expect(life.workingFor(1, 60_000)).toBe(60_000);
    life.observe([view(1, { kind: 'done' })], 70_000);
    expect(life.workingFor(1, 80_000)).toBe(0);
  });

  it('a celebration bounces it', () => {
    const life = new ClawdLife();
    life.observe([view(1)], 0);
    life.celebrate(1);
    life.observe([view(1)], 0);
    expect(life.hop(1, 230)).toBeGreaterThan(5);
  });
});
