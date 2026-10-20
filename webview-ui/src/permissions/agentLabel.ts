import { displayName } from '../identity/identityStore.js';
import type { OfficeState } from '../office/engine/officeState.js';

/** Last path segment, for labelling a session by its folder. */
function folderName(cwd: string | undefined): string | undefined {
  return cwd?.split(/[\\/]/).filter(Boolean).pop();
}

/**
 * How the office names an agent in cards, dialogs and toasts — the same name
 * its label shows (identityStore.displayName), else the folder of the asking
 * session, else its number. Never invented: every fallback is something the
 * agent really has.
 */
export function agentLabel(os: OfficeState, id: number | undefined, cwd?: string): string {
  const ch = id === undefined ? undefined : os.characters.get(id);
  const name = id === undefined ? undefined : displayName(id, ch ?? {});
  return name ?? folderName(cwd) ?? `Agente ${id ?? '?'}`;
}
