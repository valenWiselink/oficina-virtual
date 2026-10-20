/** What the user chose last time they launched into a folder. */
export interface LaunchChoice {
  nickname: string;
  palette: number;
  /** null/absent = Claude Code's default. */
  model?: string | null;
  effort?: string | null;
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
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      nickname: parsed.nickname,
      palette: parsed.palette as number,
      model: text(parsed.model),
      effort: text(parsed.effort),
    };
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

/** An agent already in the office, as far as a new one's name and colour go. */
export interface TakenLook {
  name: string;
  palette: number;
}

/**
 * The dialog's starting name and colour: what was chosen last time in the
 * folder, unless an agent in the office already has it — a second agent in
 * the same folder then gets "Pagos 2" and the least used colour, so the two
 * are told apart at a glance.
 */
export function freshLaunchChoice(
  last: LaunchChoice | null,
  taken: readonly TakenLook[],
  colors: number,
): LaunchChoice {
  const names = new Set(taken.map((t) => t.name.trim().toLowerCase()));
  let nickname = last?.nickname.trim() ?? '';
  if (nickname && names.has(nickname.toLowerCase())) {
    const base = nickname.replace(/\s+\d+$/, '') || nickname;
    let n = 2;
    while (names.has(`${base} ${n}`.toLowerCase())) n++;
    nickname = `${base} ${n}`;
  }

  const wanted = last && last.palette >= 0 && last.palette < colors ? last.palette : 0;
  const uses = Array.from(
    { length: colors },
    (_, p) => taken.filter((t) => t.palette === p).length,
  );
  let palette = wanted;
  if (uses[wanted] > 0) {
    // The least used colour, counting from the one after the wanted one.
    for (let step = 1; step < colors; step++) {
      const p = (wanted + step) % colors;
      if (uses[p] < uses[palette]) palette = p;
    }
  }
  return { nickname, palette, model: last?.model ?? null, effort: last?.effort ?? null };
}
