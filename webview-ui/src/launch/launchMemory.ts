/** What the user chose last time they launched into a folder. */
export interface LaunchChoice {
  nickname: string;
  palette: number;
}

const KEY_PREFIX = 'oficina.lanzamiento.';

/**
 * Per-folder memory of the launch dialog ("remember per repo"). Browser
 * storage is enough: one office, one PC, one browser — and it is only a
 * convenience, so every access tolerates storage being unavailable.
 */
export function recallLaunchChoice(directoryPath: string): LaunchChoice | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + directoryPath.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LaunchChoice>;
    if (typeof parsed.nickname !== 'string' || !Number.isInteger(parsed.palette)) return null;
    return { nickname: parsed.nickname, palette: parsed.palette as number };
  } catch {
    return null;
  }
}

export function rememberLaunchChoice(directoryPath: string, choice: LaunchChoice): void {
  try {
    localStorage.setItem(KEY_PREFIX + directoryPath.toLowerCase(), JSON.stringify(choice));
  } catch {
    /* private window / blocked storage: next time the dialog starts blank */
  }
}
