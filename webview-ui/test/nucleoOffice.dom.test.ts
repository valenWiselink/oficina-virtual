// @vitest-environment jsdom
/**
 * Núcleo, rendered whole, with sessions that do not run in the office. #42
 * left VS Code and desktop-app sessions out of the graph and of what Jarvis
 * hears; Núcleo (1.0.54) listed them again on its right: «¿Qué me estás
 * queriendo decir?» (Terminó), a desktop-app conversation that, touched,
 * only said «Traer a la oficina… no la puede traer» (2026-11-20).
 */
import './browserTicks.ts';

import assert from 'node:assert/strict';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { NucleoView } from '../src/nucleo/NucleoView.tsx';
import type { AgentView } from '../src/views/agentViews.ts';

const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
env.IS_REACT_ACT_ENVIRONMENT = true;

function agent(id: number, name: string, extra: Partial<AgentView> = {}): AgentView {
  return {
    id,
    name,
    key: name,
    palette: 0,
    hueShift: 0,
    kind: 'idle',
    statusText: '',
    canSetRun: true,
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
/** Runs in an office terminal, at work. */
const penta = agent(2, 'penta', { kind: 'work', statusText: 'Editando app.ts' });
/** The desktop app's conversation from the screenshot: it finished. */
const desktop = agent(3, '¿Qué me estás queriendo decir?', {
  kind: 'done',
  statusText: 'Terminó',
  canSetRun: false,
  hasTerminal: false,
});
/** A VS Code session at work: not one more agent Jarvis coordinates. */
const vscode = agent(4, 'webapp-vscode', {
  kind: 'work',
  statusText: 'Leyendo',
  canSetRun: false,
  hasTerminal: false,
});
/** A VS Code session holding a permission: answered in VS Code, not here. */
const asking = agent(5, 'permiso-vscode', {
  kind: 'needs',
  statusText: 'Espera permiso',
  canSetRun: false,
  hasTerminal: false,
  permission: {
    type: 'permissionPending',
    requestId: 'r5',
    id: 5,
    toolName: 'Bash',
    toolInput: {},
    createdAt: 0,
  },
});

let root: Root;
let host: HTMLElement;
const selected: number[] = [];

beforeEach(() => {
  // No WebGL nor ResizeObserver in jsdom: the sphere falls back, the rest renders.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  selected.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      createElement(NucleoView, {
        // What App hands it: the office without Jarvis, outsiders included.
        views: [penta, desktop, vscode, asking],
        actions: { onSelect: (id: number) => selected.push(id) },
        jarvis,
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const section = (label: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`section[aria-label="${label}"]`);
  assert.ok(el, `«${label}» is on screen`);
  return el;
};

describe('Núcleo shows only the agents that run in the office', () => {
  it('lists the office agent and none of the outside sessions', () => {
    const agents = section('Agentes');
    const names = [...agents.querySelectorAll('li')].map((li) => li.textContent ?? '');
    assert.equal(names.length, 1);
    assert.match(names[0], /penta/);
    assert.doesNotMatch(document.body.textContent ?? '', /Qué me estás queriendo decir/);
    assert.doesNotMatch(document.body.textContent ?? '', /webapp-vscode/);
  });

  it('counts only the office agents at work', () => {
    assert.match(section('Agentes').querySelector('h3')?.textContent ?? '', /^1\s*trabajando/);
    assert.match(section('Jarvis').textContent ?? '', /Coordinando a 1 agente(?!s)/);
  });

  it('keeps an outside permission out of «Te necesita»', () => {
    assert.doesNotMatch(section('Te necesita').textContent ?? '', /permiso-vscode/);
  });

  it('a row opens an office agent', () => {
    const row = section('Agentes').querySelector('button');
    assert.ok(row);
    act(() => row.click());
    assert.deepEqual(selected, [penta.id]);
  });
});
