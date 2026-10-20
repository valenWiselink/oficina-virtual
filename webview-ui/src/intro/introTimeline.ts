/**
 * The presentation's timeline, pure (tested without a DOM): the scenes with
 * how long each plays, stepping between them, which beat of a scene is due,
 * and where each card of the board scene sits at every beat.
 */

export type SceneId = 'logo' | 'team' | 'board' | 'spaces' | 'graph' | 'chat' | 'day' | 'finale';

export interface Scene {
  id: SceneId;
  /** How long it plays before the next one; null = waits for "Empezar". */
  ms: number | null;
}

export const SCENES: readonly Scene[] = [
  { id: 'logo', ms: 4400 },
  { id: 'team', ms: 4800 },
  { id: 'board', ms: 7000 },
  { id: 'spaces', ms: 6800 },
  { id: 'graph', ms: 5400 },
  { id: 'chat', ms: 6600 },
  { id: 'day', ms: 6400 },
  { id: 'finale', ms: null },
];

export const nextScene = (i: number): number => Math.min(SCENES.length - 1, i + 1);
export const prevScene = (i: number): number => Math.max(0, i - 1);

/** The last beat whose start time has passed (beats are start offsets in ms). */
export function beatAt(elapsedMs: number, beats: readonly number[]): number {
  let beat = 0;
  beats.forEach((start, i) => {
    if (elapsedMs >= start) beat = i;
  });
  return beat;
}

/** Board scene beats: columns, cards in, one needs you, cursor, click, done. */
export const BOARD_BEATS = [0, 900, 2300, 3800, 4800, 5300] as const;

export type BoardCardId = 'pagos' | 'web' | 'api' | 'docs';
/** Columns left to right: Te necesita, Trabajando, Terminó, Sin tarea. */
export type BoardSlot = { col: 0 | 1 | 2 | 3; row: number; shown: boolean };

/** Where each card is at a beat of the board scene. */
export function boardLayout(beat: number): Record<BoardCardId, BoardSlot> {
  const shown = beat >= 1;
  const needs = beat >= 2 && beat < 5;
  const done = beat >= 5;
  return {
    pagos: needs
      ? { col: 0, row: 0, shown }
      : done
        ? { col: 2, row: 1, shown }
        : { col: 1, row: 0, shown },
    web: { col: 1, row: needs || done ? 0 : 1, shown },
    api: done ? { col: 1, row: 1, shown } : { col: 3, row: 0, shown },
    docs: { col: 2, row: 0, shown },
  };
}

/** Workspaces scene beats: all, cursor to Wiselink, click, Personal needs
 *  you (badge), cursor to Personal, click. */
export const SPACES_BEATS = [0, 1300, 2200, 3300, 4300, 5100] as const;

export type SpaceTab = 'todos' | 'wiselink' | 'personal';
export type SpacesAgentId = 'pagos' | 'web' | 'blog' | 'api' | 'docs' | 'fotos';
export const SPACES_AGENTS: ReadonlyArray<{
  id: SpacesAgentId;
  space: Exclude<SpaceTab, 'todos'>;
}> = [
  { id: 'pagos', space: 'wiselink' },
  { id: 'web', space: 'wiselink' },
  { id: 'blog', space: 'personal' },
  { id: 'api', space: 'wiselink' },
  { id: 'docs', space: 'wiselink' },
  { id: 'fotos', space: 'personal' },
];

export interface SpacesView {
  tab: SpaceTab;
  /** "Personal" shows its needs-you count while another space is open. */
  badge: boolean;
  /** Grid position (reading order) and whether the card is in the open space. */
  cards: Record<SpacesAgentId, { slot: number; shown: boolean }>;
}

/** What the workspaces scene shows at a beat. */
export function spacesView(beat: number): SpacesView {
  const tab: SpaceTab = beat >= 5 ? 'personal' : beat >= 2 ? 'wiselink' : 'todos';
  const visible = SPACES_AGENTS.filter((a) => tab === 'todos' || a.space === tab);
  const cards = {} as SpacesView['cards'];
  SPACES_AGENTS.forEach((a, i) => {
    const at = visible.indexOf(a);
    cards[a.id] = at >= 0 ? { slot: at, shown: true } : { slot: i, shown: false };
  });
  return { tab, badge: beat >= 3 && beat < 5, cards };
}

/** Day scene beats: the panel, then each agent's row, then the PR merged. */
export const DAY_BEATS = [0, 700, 1500, 2300, 3200, 4000] as const;

/** The part of `text` typed by now: one character every `msPerChar` from `startMs`. */
export function typedText(
  text: string,
  startMs: number,
  msPerChar: number,
  elapsedMs: number,
): string {
  if (elapsedMs < startMs) return '';
  return text.slice(0, Math.floor((elapsedMs - startMs) / msPerChar) + 1);
}

/** The part of `text` streamed by now, a word at a time (Claude answering). */
export function streamedWords(
  text: string,
  startMs: number,
  msPerWord: number,
  elapsedMs: number,
): string {
  if (elapsedMs < startMs) return '';
  const words = text.split(' ');
  return words.slice(0, Math.floor((elapsedMs - startMs) / msPerWord) + 1).join(' ');
}
