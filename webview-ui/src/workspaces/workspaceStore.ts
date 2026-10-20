import { useSyncExternalStore } from 'react';

import {
  ALL,
  followKeys,
  withoutWorkspace,
  type Workspace,
  type WorkspaceState,
} from './workspaceRules.js';

/**
 * The workspaces, the agents moved into them by hand and the one on screen,
 * remembered in this browser (like the graph's pins and the outfits).
 */
const KEY = 'oficina.espacios';
const NAME_MAX = 32;

let state: WorkspaceState = recall();
const listeners = new Set<() => void>();

function isWorkspace(w: unknown): w is Workspace {
  const o = w as Workspace;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.folders);
}

function recall(): WorkspaceState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<WorkspaceState>;
    const workspaces = (Array.isArray(raw.workspaces) ? raw.workspaces : []).filter(isWorkspace);
    const assignments = Object.fromEntries(
      Object.entries(raw.assignments ?? {}).filter(([, v]) => typeof v === 'string'),
    ) as Record<string, string>;
    const current =
      typeof raw.current === 'string' && workspaces.some((w) => w.id === raw.current)
        ? raw.current
        : ALL;
    return { workspaces, assignments, current };
  } catch {
    return { workspaces: [], assignments: {}, current: ALL };
  }
}

function commit(next: WorkspaceState): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

const cleanName = (name: string) => name.trim().slice(0, NAME_MAX) || 'Espacio';

/** A new workspace, shown right away. Returns its id. */
export function createWorkspace(name: string, folders: string[]): string {
  const id = `esp-${Date.now().toString(36)}`;
  commit({
    ...state,
    workspaces: [...state.workspaces, { id, name: cleanName(name), folders }],
    current: id,
  });
  return id;
}

export function updateWorkspace(id: string, changes: { name: string; folders: string[] }): void {
  commit({
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === id ? { ...w, name: cleanName(changes.name), folders: changes.folders } : w,
    ),
  });
}

export function deleteWorkspace(id: string): void {
  commit(withoutWorkspace(state, id));
}

export function selectWorkspace(id: string): void {
  if (id === state.current) return;
  if (id !== ALL && !state.workspaces.some((w) => w.id === id)) return;
  commit({ ...state, current: id });
}

/** Put an agent in a workspace by hand (null: back to the folder rule). */
export function assignAgent(agentKey: string, workspaceId: string | null): void {
  const assignments = { ...state.assignments };
  if (workspaceId) assignments[agentKey] = workspaceId;
  else delete assignments[agentKey];
  commit({ ...state, assignments });
}

/** Agents whose key changed keep their manual workspace. */
export function followAgentKeys(moved: ReadonlyArray<{ from: string; to: string }>): void {
  if (!moved.some((m) => state.assignments[m.from])) return;
  commit({ ...state, assignments: followKeys(state.assignments, moved) });
}

export function workspaceState(): WorkspaceState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The workspaces and the one on screen, re-rendering when they change. */
export function useWorkspaces(): WorkspaceState {
  return useSyncExternalStore(subscribe, () => state);
}
