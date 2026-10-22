/**
 * The rules behind a team supervisor opening and closing agents
 * (lanzar_agente, cerrar_agente in supervisorTools.ts): where it may open one
 * — only where the new agent lands in its own scope, by the same rule the
 * office places agents with — and what state an agent has to be in to be
 * closed. How many it may keep alive is the registry's (supervision.ts).
 * Pure enough to be tested without an office.
 */

import * as fs from 'fs';
import * as path from 'path';

import { runningBackground } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { expandTilde, normalizeDirectoryPath } from '../directories.js';
import type { AgentState } from '../types.js';
import type { SupervisionScope } from './supervision.js';

const PLACES_SHOWN = 8;

/** The folder name of a path, as workspaces and agents name folders. */
export function folderName(dirPath: string): string {
  return (
    dirPath
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? dirPath
  );
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface LaunchPlaces {
  scope: SupervisionScope;
  /** Workspace scope: the folder names whose agents land in its workspace, as
   *  the browser sent them (undefined: not sent yet; most workspaces have none
   *  and are made by hand with "Mover a…"). */
  workspaceFolders?: readonly string[];
  /** Full paths of the supervisor's own folder and its team's. */
  teamFolders: readonly string[];
  /** Full paths the office knows (its agents, Directories, past sessions): a
   *  folder given by name resolves against these. */
  knownFolders: readonly string[];
  isDirectory?: (dirPath: string) => boolean;
}

export type FolderVerdict = { ok: true; path: string } | { ok: false; reason: string };

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function unique(paths: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const p of paths) {
    if (!p) continue;
    const key = normalizeDirectoryPath(p);
    if (!byKey.has(key)) byKey.set(key, p);
  }
  return [...byKey.values()];
}

/** Why a full path is out of the supervisor's scope, or undefined when it is in. */
function outOfScope(dirPath: string, places: LaunchPlaces): string | undefined {
  const scope = places.scope;
  const key = normalizeDirectoryPath(dirPath);
  const isAny = (paths: readonly string[]) => paths.some((p) => normalizeDirectoryPath(p) === key);
  // Where it or its team already works is always in scope: what it opens
  // there stays on its team (the office remembers who opened it).
  if (isAny(places.teamFolders)) return undefined;
  if (scope.kind === 'workspace') {
    return (places.workspaceFolders ?? []).some((f) => sameName(f, folderName(dirPath)))
      ? undefined
      : `«${folderName(dirPath)}» no es una carpeta de tu espacio «${scope.name}» ni de tu equipo.`;
  }
  if (scope.kind === 'agents') return 'Sólo podés abrir agentes donde trabajan vos o tus agentes.';
  return isAny(places.knownFolders)
    ? undefined
    : 'Esa carpeta no la conoce la oficina (ningún agente trabajó ahí ni es una de sus carpetas).';
}

/** Where it may launch, in words, for a refusal. */
export function placesText(places: LaunchPlaces): string {
  const paths = unique(
    places.scope.kind === 'all'
      ? [...places.teamFolders, ...places.knownFolders]
      : places.teamFolders,
  );
  const named = places.scope.kind === 'workspace' ? (places.workspaceFolders ?? []) : [];
  const parts = [
    paths.length > 0
      ? `Podés abrir en: ${paths.slice(0, PLACES_SHOWN).join(', ')}${paths.length > PLACES_SHOWN ? '…' : ''}.`
      : '',
    named.length > 0 ? `También en las carpetas de tu espacio: ${named.join(', ')}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * The folder to launch in: a full path, or a folder's name resolved against
 * the folders the office knows. It must exist and be in the supervisor's own
 * scope: where it or its team works, or (a workspace) one of its folders, or
 * (for "all") any folder the office knows.
 */
export function launchFolder(requested: string, places: LaunchPlaces): FolderVerdict {
  const raw = requested.trim().replace(/^«|»$/g, '');
  const exists = places.isDirectory ?? isDirectory;
  const refuse = (reason: string): FolderVerdict => ({
    ok: false,
    reason: [reason, placesText(places)].filter(Boolean).join(' '),
  });
  if (!raw) return refuse('Decime en qué carpeta: su nombre o la ruta completa.');

  if (!/[\\/]/.test(raw) && raw !== '~') {
    // A name: the folders with that name the office knows, inside the scope.
    const named = unique([...places.teamFolders, ...places.knownFolders]).filter(
      (p) => sameName(folderName(p), raw) && exists(p) && !outOfScope(p, places),
    );
    if (named.length === 1) return { ok: true, path: named[0] };
    if (named.length > 1) {
      return refuse(
        `Hay más de una carpeta «${raw}»: pasame la ruta completa (${named.join(', ')}).`,
      );
    }
    const why = outOfScope(raw, places);
    return refuse(why ?? `No conozco una carpeta «${raw}»: pasame la ruta completa.`);
  }

  const resolved = path.resolve(expandTilde(raw));
  if (!exists(resolved)) return refuse(`No existe la carpeta ${resolved}.`);
  const why = outOfScope(resolved, places);
  return why ? refuse(why) : { ok: true, path: resolved };
}

/** What an agent is doing, as a supervisor's tools see it. */
export interface TeamState {
  kind: 'needs' | 'work' | 'done' | 'idle';
  words: string;
}

/**
 * Its state from what the office knows: a permission held for it (or asked
 * in its terminal) or a question waiting → needs; a turn in progress, a
 * running tool, background work or a busy meeting member → work; else done
 * (it answered something) or idle.
 */
export function teamState(
  id: number,
  agent: AgentState,
  pendingPermissions: number,
  store: AgentStateStore,
): TeamState {
  if (pendingPermissions > 0) return { kind: 'needs', words: 'te necesita (permiso)' };
  if (agent.permissionSent) {
    return { kind: 'needs', words: 'te necesita (permiso en su terminal)' };
  }
  if ([...agent.activeToolNames.values()].includes('AskUserQuestion')) {
    return { kind: 'needs', words: 'te necesita (pregunta)' };
  }
  if (!agent.isWaiting || agent.activeToolIds.size > 0) {
    return { kind: 'work', words: 'trabajando' };
  }
  if (runningBackground(agent).length > 0 || agent.backgroundAgentToolIds.size > 0) {
    return { kind: 'work', words: 'trabajando (espera un proceso de fondo)' };
  }
  for (const other of store.values()) {
    if (other.leadAgentId === id && other.id !== id && !other.isWaiting) {
      return { kind: 'work', words: 'trabajando (en junta)' };
    }
  }
  return agent.lastReply
    ? { kind: 'done', words: 'terminó su turno' }
    : { kind: 'idle', words: 'sin tarea' };
}
