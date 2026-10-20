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
