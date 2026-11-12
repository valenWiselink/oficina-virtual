// @vitest-environment jsdom
/**
 * The «Asistente» screen, rendered whole, with keys typed into Jarvis's box
 * the way a browser delivers them. v1.0.50 lost the first letter you typed
 * («Seguimos» became «eguimos»): noticing you were writing re-rendered the
 * box before it took the letter.
 */
import './browserTicks.ts';

import assert from 'node:assert/strict';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { AsistenteView } from '../src/asistente/AsistenteView.tsx';
import type { AgentView } from '../src/views/agentViews.ts';
import { deliverLikeABrowser } from './browserTicks.ts';

const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
env.IS_REACT_ACT_ENVIRONMENT = true;

const MIN = 60_000;

function agent(id: number, name: string, extra: Partial<AgentView> = {}): AgentView {
  return {
    id,
    name,
    key: name,
    palette: 0,
    hueShift: 0,
    kind: 'idle',
    statusText: '',
    canSetRun: false,
    supervisedBy: [],
    supervisorNames: [],
    teamSize: 0,
    subagents: [],
    hasTerminal: true,
    tasks: [],
    ...extra,
  } as AgentView;
}

const jarvis = agent(1, 'Jarvis', { supervision: { kind: 'all' } } as Partial<AgentView>);
const views = [jarvis, agent(2, 'penta')];

/** What the office sends: asks waiting on you (cards above the box). */
function sendAsks(count: number): void {
  const now = Date.now();
  const open = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    from: 'Jarvis',
    at: now - (i + 1) * MIN,
    text: `Decisión ${i + 1}`,
  }));
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'pendingAsks', open, closed: [] } }),
    );
  });
}

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  // 11:00, a workday morning: no «Cierre del día» yet.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 11, 0));
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(AsistenteView, { views, actions: { onSelect: () => {} }, jarvis }));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const box = (): HTMLTextAreaElement => {
  const el = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Mensaje para Jarvis"]',
  );
  assert.ok(el, 'Jarvis’s box is on screen');
  return el;
};

const setNativeValue = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value',
)!.set!;

/**
 * One key, as a browser types it: the text changes, then «input» fires,
 * with React left to render when a browser would let it (not inside act,
 * which would hold every render to the end and hide the bug).
 */
function press(el: HTMLTextAreaElement, key: string): void {
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    deliverLikeABrowser(el, new KeyboardEvent('keydown', { key, bubbles: true }));
    const next = key === 'Backspace' ? el.value.slice(0, -1) : el.value + key;
    setNativeValue.call(el, next);
    deliverLikeABrowser(el, new InputEvent('input', { bubbles: true, data: key }));
    deliverLikeABrowser(el, new KeyboardEvent('keyup', { key, bubbles: true }));
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = true;
  }
}

function type(el: HTMLTextAreaElement, text: string): void {
  for (const ch of text) press(el, ch);
}

function focus(el: HTMLTextAreaElement): void {
  act(() => el.focus());
}

const pressedMoment = (): string =>
  [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent).join(' ');

describe('typing to Jarvis on the Asistente screen', () => {
  it('keeps the first letter', () => {
    const el = box();
    focus(el);
    press(el, 'S');
    assert.equal(box().value, 'S');
    type(box(), 'eguimos mañana');
    assert.equal(box().value, 'Seguimos mañana');
    assert.equal(document.activeElement, box(), 'the box keeps the focus');
  });

  it('keeps it when the first letter folds «Decidir» into «Escribir»', () => {
    sendAsks(2);
    assert.match(pressedMoment(), /Decidir/);
    assert.ok(document.querySelector('[aria-label="Decisión 1"]'), 'a card above the box');
    const el = box();
    focus(el);
    press(el, 'S');
    assert.equal(box(), el, 'the same box, not a new one');
    assert.equal(el.value, 'S');
    assert.match(pressedMoment(), /Escribir/);
    type(el, 'eguimos');
    assert.equal(el.value, 'Seguimos');
  });

  it('keeps it with «Decidir» chosen by hand and its cards in sight', () => {
    sendAsks(2);
    // As after a click on «Decidir»: the moment stays while you write.
    const decidir = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Decidir'),
    );
    assert.ok(decidir);
    act(() => decidir.click());
    const el = box();
    focus(el);
    type(el, 'Seguimos');
    assert.equal(el.value, 'Seguimos');
    assert.ok(document.querySelector('[aria-label="Decisión 1"]'), 'the cards stay');
  });

  it('keeps every key across moments: emptied and written again, a card arriving', () => {
    sendAsks(1);
    const el = box();
    focus(el);
    type(el, 'Hola');
    assert.match(pressedMoment(), /Escribir/);
    for (let i = 0; i < 4; i++) press(el, 'Backspace');
    assert.equal(el.value, '');
    assert.match(pressedMoment(), /Decidir/, 'empty again: back to deciding');
    type(el, 'Dale');
    assert.equal(el.value, 'Dale');
    sendAsks(3);
    type(el, ' ya');
    assert.equal(el.value, 'Dale ya');
    assert.equal(box(), el);
  });
});
