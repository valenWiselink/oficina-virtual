/**
 * Workspaces ("espacios de trabajo"): named groups of agents, so each view
 * can show one group at a time. Pure rules here (tested); the store that
 * remembers them lives in workspaceStore.ts.
 *
 * An agent belongs to its manual assignment ("Mover a…"), else to the first
 * workspace whose folders include the folder it works in, else to none.
 * "Todos" (ALL) is not a workspace: it shows everyone.
 */

export const ALL = 'todos';

export interface Workspace {
  id: string;
  name: string;
  /** Folder names (last path segment) whose agents land here by themselves. */
  folders: string[];
}

export interface WorkspaceState {
  workspaces: Workspace[];
  /** agent key → workspace id, set by hand. */
  assignments: Record<string, string>;
  /** The workspace on screen, or ALL. */
  current: string;
}

/** What the rules need to know about an agent. */
export interface Placeable {
  key: string;
  dir?: string;
}

const sameFolder = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The workspace an agent belongs to, or null. */
export function workspaceOf(agent: Placeable, state: WorkspaceState): string | null {
  const manual = state.assignments[agent.key];
  if (manual && state.workspaces.some((w) => w.id === manual)) return manual;
  if (!agent.dir) return null;
  const byFolder = state.workspaces.find((w) => w.folders.some((f) => sameFolder(f, agent.dir!)));
  return byFolder?.id ?? null;
}

/** The agents a workspace shows (ALL: everyone). */
export function inWorkspace<T extends Placeable>(
  agents: readonly T[],
  state: WorkspaceState,
  workspaceId: string,
): T[] {
  if (workspaceId === ALL) return [...agents];
  return agents.filter((a) => workspaceOf(a, state) === workspaceId);
}

/** How many agents need you in each workspace (ALL counts everyone). */
export function needsByWorkspace<T extends Placeable & { kind: string }>(
  agents: readonly T[],
  state: WorkspaceState,
): Record<string, number> {
  const counts: Record<string, number> = { [ALL]: 0 };
  for (const a of agents) {
    if (a.kind !== 'needs') continue;
    counts[ALL]++;
    const ws = workspaceOf(a, state);
    if (ws) counts[ws] = (counts[ws] ?? 0) + 1;
  }
  return counts;
}

/**
 * Where to look for an agent: the current workspace if it is there, else its
 * own workspace, else ALL (so jumping to it never lands on a view without it).
 */
export function workspaceToShow(agent: Placeable, state: WorkspaceState): string {
  if (state.current === ALL) return ALL;
  const own = workspaceOf(agent, state);
  if (own === state.current) return state.current;
  return own ?? ALL;
}

/** State with a workspace removed (its assignments go too; ALL if it was on). */
export function withoutWorkspace(state: WorkspaceState, id: string): WorkspaceState {
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(([, ws]) => ws !== id),
  );
  return {
    workspaces: state.workspaces.filter((w) => w.id !== id),
    assignments,
    current: state.current === id ? ALL : state.current,
  };
}

/** The workspaces with `id` moved to sit just before `beforeId` (null: at the
 *  end). The order is the tabs' order, and also which workspace claims an
 *  agent first when two share a folder. Unknown ids leave it as it was. */
export function moveWorkspace(
  workspaces: readonly Workspace[],
  id: string,
  beforeId: string | null,
): Workspace[] {
  const moving = workspaces.find((w) => w.id === id);
  if (!moving || id === beforeId) return [...workspaces];
  const rest = workspaces.filter((w) => w.id !== id);
  const at = beforeId === null ? rest.length : rest.findIndex((w) => w.id === beforeId);
  if (at < 0) return [...workspaces];
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/** Agents whose key changed (a session id arriving after the name): their
 *  manual assignment follows them. Returns the new assignments. */
export function followKeys(
  assignments: Record<string, string>,
  moved: ReadonlyArray<{ from: string; to: string }>,
): Record<string, string> {
  const next = { ...assignments };
  for (const { from, to } of moved) {
    const ws = next[from];
    if (!ws || next[to]) continue;
    next[to] = ws;
    delete next[from];
  }
  return next;
}

/** An agent you launched from the office while a workspace was on screen. */
export interface Launch {
  /** Folder name (last path segment) it was launched in. */
  folder: string;
  workspaceId: string;
}

/** The folder name of a path, as workspaces and agents name folders. */
export function folderOf(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? path
  );
}

/**
 * Agents that just appeared (not in `before`) and match one of your launches
 * join the workspace you launched them from, even when a folder rule would
 * put them elsewhere. Agents that only come back (the office restarted, a
 * session resumed) match no launch and stay where they were — measured
 * 2026-10-20: the 1.0.4 restart had piled every agent into the open
 * workspace. The first look (`before` null) assigns nobody; each launch
 * places one agent.
 */
export function newcomersToAssign(
  before: ReadonlySet<number> | null,
  agents: ReadonlyArray<Placeable & { id: number }>,
  launches: readonly Launch[],
): Array<{ key: string; launch: Launch }> {
  if (!before) return [];
  const open = [...launches];
  const placed: Array<{ key: string; launch: Launch }> = [];
  for (const a of agents) {
    if (before.has(a.id) || !a.dir) continue;
    const at = open.findIndex((l) => sameFolder(l.folder, a.dir!));
    if (at < 0) continue;
    placed.push({ key: a.key, launch: open.splice(at, 1)[0] });
  }
  return placed;
}

/** Agents whose key changed since the last look (`before`: id → key). */
export function changedKeys(
  before: ReadonlyMap<number, string> | null,
  agents: ReadonlyArray<{ id: number; key: string }>,
): Array<{ from: string; to: string }> {
  if (!before) return [];
  return agents.flatMap((a) => {
    const old = before.get(a.id);
    return old && old !== a.key ? [{ from: old, to: a.key }] : [];
  });
}
