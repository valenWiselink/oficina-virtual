/**
 * Pure helpers for the updater (no Electron here, so the webview tests can
 * import them): release notes as electron-updater hands them over, and what
 * to tell the user on the first start after an update.
 */

/** One version's notes, as the release wrote them (HTML from GitHub's feed,
 *  or whatever a generic feed's latest.yml carries). */
export interface ReleaseNote {
  version: string;
  note: string;
}

/** What the office says once after an update ("Ahora tenés la 1.0.15: trae…"). */
export interface WhatsNew {
  version: string;
  /** Empty when the notes were never saved (the previous version did not
   *  keep them): the page links to the release instead. */
  notes: ReleaseNote[];
}

/**
 * electron-updater's `releaseNotes`: a string (the latest release only), an
 * array of {version, note} (fullChangelog: every version newer than the one
 * running, newest first), or null. Always an array here, newest first,
 * without empty notes.
 */
export function normalizeReleaseNotes(raw: unknown, version: string): ReleaseNote[] {
  if (typeof raw === 'string') return raw.trim() ? [{ version, note: raw }] : [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ReleaseNote[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { version: v, note } = item as { version?: unknown; note?: unknown };
    if (typeof note !== 'string' || !note.trim()) return [];
    return [{ version: typeof v === 'string' && v ? v : version, note }];
  });
}

/** What the app remembers about versions between runs (estado.json). */
export interface VersionMemory {
  /** The version that ran last time; absent before 1.0.15, which did not
   *  record it. */
  lastVersion?: string;
  /** Notes of the update that was downloaded and waits to be installed. */
  pendingUpdate?: { version: string; notes: ReleaseNote[] };
  /** Any state at all was there (a fresh install has none). */
  hadState: boolean;
}

/**
 * The first start of a new version says what it brings, once. A fresh
 * install says nothing; a start from an older version that never recorded
 * itself (1.0.14 and before) still counts as an update when it left state
 * behind. The notes are the downloaded update's when they match this
 * version (fullChangelog also brings the skipped versions' notes).
 */
export function whatsNewOnStart(memory: VersionMemory, current: string): WhatsNew | undefined {
  const updated = memory.lastVersion ? memory.lastVersion !== current : memory.hadState;
  if (!updated) return undefined;
  const pending = memory.pendingUpdate;
  const notes = pending && pending.version === current ? pending.notes : [];
  return { version: current, notes };
}
