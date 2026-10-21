/** A hand-off between two subagents of one meeting, as the office draws it. */
export interface DrawnFileLink {
  fromId: number;
  toId: number;
  /** How many hand-offs between these two (either direction counts once each). */
  count: number;
  lastFile: string;
  lastAt: number;
}

/** A link fades out after this long without a new hand-off. */
export const FILE_LINK_TTL_MS = 30_000;

const links = new Map<string, DrawnFileLink>();

/** Record one hand-off (character ids already resolved from tool ids). */
export function addFileLink(
  fromId: number,
  toId: number,
  fileName: string,
  now = Date.now(),
): void {
  recordFilePass(fromId, toId, fileName, now);
  const key = `${fromId}>${toId}`;
  const link = links.get(key);
  if (link) {
    link.count++;
    link.lastFile = fileName;
    link.lastAt = now;
  } else {
    links.set(key, { fromId, toId, count: 1, lastFile: fileName, lastAt: now });
  }
}

/** Links still worth drawing; expired ones are dropped. */
export function liveFileLinks(now = Date.now()): DrawnFileLink[] {
  for (const [key, link] of links) {
    if (now - link.lastAt > FILE_LINK_TTL_MS) links.delete(key);
  }
  return [...links.values()];
}

/** One hand-off as a member's panel lists it. */
export interface FilePass {
  fromId: number;
  toId: number;
  file: string;
  at: number;
}

/** How many hand-offs each member's panel keeps. */
const HISTORY_PER_MEMBER = 20;
const history = new Map<number, FilePass[]>();

function remember(id: number, pass: FilePass): void {
  const list = [pass, ...(history.get(id) ?? [])].slice(0, HISTORY_PER_MEMBER);
  history.set(id, list);
}

/** Record a hand-off in both members' histories (they outlive the line). */
export function recordFilePass(fromId: number, toId: number, file: string, now = Date.now()): void {
  const pass = { fromId, toId, file, at: now };
  remember(fromId, pass);
  remember(toId, pass);
}

/** The hand-offs a member made or got this session, newest first. */
export function filePassesOf(id: number): readonly FilePass[] {
  return history.get(id) ?? [];
}
