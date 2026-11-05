import * as path from 'path';

import type { ArtifactEntry } from '../../../core/src/messages.js';
import { pickSessionTitle } from '../dayRecaps.js';

export const UNTITLED_ARTIFACT = '(sin título)';
const TITLE_MAX = 160;
/** What the page gets at most: the newest. */
const SHOWN_MAX = 500;
/** A listing can start before a publish it is recorded after: spare what is this close to it. */
const LIST_GRACE_MS = 60_000;

const ARTIFACT_URL = /https:\/\/claude\.ai\/(code\/)?artifact\/([A-Za-z0-9_-]{8,64})/;

/** What a transcript says about an artifact, kept across restarts. */
export interface ArtifactRecord {
  id: string;
  url: string;
  title: string;
  /** Its last publish (or what a listing said), ms epoch. */
  at: number;
  sessionId?: string;
  /** The session's name when last seen: its transcript may be gone later. */
  agent?: string;
  /** Last segment of the session's working directory. */
  folder?: string;
}

export interface SessionTitle {
  custom?: string;
  ai?: string;
}

export interface ArtifactIndex {
  artifacts: Record<string, ArtifactRecord>;
  /** Removed by an agent, with when. */
  deleted: Record<string, number>;
  /** The newest listing that named every artifact of the account. */
  fullList?: { at: number; ids: string[] };
  titles: Record<string, SessionTitle>;
}

export function emptyIndex(): ArtifactIndex {
  return { artifacts: {}, deleted: {}, titles: {} };
}

/** The bits of an `Artifact` tool call the answer does not repeat. */
export interface ArtifactCall {
  action: string;
  title?: string;
  url?: string;
  scope?: string;
  /** About something inside an artifact or a type, not the artifacts themselves. */
  narrowed?: boolean;
}

export type PendingCalls = Record<string, ArtifactCall>;

type Fields = Record<string, unknown>;

const fields = (v: unknown): Fields =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Fields) : {};
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** The canonical link and id of an artifact link; nothing else ever reaches the page. */
export function parseArtifactUrl(v: unknown): { id: string; url: string } | undefined {
  if (typeof v !== 'string') return undefined;
  const match = ARTIFACT_URL.exec(v);
  if (!match) return undefined;
  const [, code, id] = match;
  return { id, url: `https://claude.ai/${code ? 'code/' : ''}artifact/${id}` };
}

/** Uploading an asset is no publish, removing one no delete, a type's listing not the account's. */
function isNarrowed(action: string, input: Fields): boolean {
  if (action === 'publish') return input.asset === true;
  if (action === 'delete') return !!input.path;
  if (action === 'list') return !!input.type || !!input.type_url;
  return false;
}

function callOf(input: Fields): ArtifactCall {
  const action = text(input.action) ?? 'publish';
  return {
    action,
    title: text(input.title),
    url: text(input.url),
    scope: text(input.scope),
    narrowed: isNarrowed(action, input),
  };
}

function resultText(block: Fields): string {
  if (typeof block.content === 'string') return block.content;
  if (!Array.isArray(block.content)) return '';
  return block.content.map((part) => text(fields(part).text) ?? '').join(' ');
}

function cleanTitle(v: unknown): string | undefined {
  return text(v)?.slice(0, TITLE_MAX);
}

function applyPublish(
  index: ArtifactIndex,
  record: Fields,
  at: number,
  call: ArtifactCall,
  block: Fields,
): boolean {
  const answer = fields(record.toolUseResult);
  // The structured answer first; its text says the same if the shape ever moves.
  const said = resultText(block);
  const link =
    parseArtifactUrl(answer.url) ??
    (/^(Published|Created|Updated) /.test(said) ? parseArtifactUrl(said) : undefined);
  if (!link) return false;
  const current = index.artifacts[link.id];
  const sessionId = text(record.sessionId);
  const cwd = text(record.cwd);
  const who = {
    ...(sessionId ? { sessionId } : {}),
    // The transcript's own OS wrote it: both separators may appear.
    ...(cwd ? { folder: path.win32.basename(cwd) } : {}),
  };
  if (current && at < current.at) {
    // Older than what is known: all it can add is who made it.
    if (current.sessionId || !sessionId) return false;
    Object.assign(current, who);
    return true;
  }
  const title = cleanTitle(answer.title) ?? cleanTitle(call.title);
  index.artifacts[link.id] = {
    ...current,
    ...who,
    ...link,
    title: title ?? current?.title ?? UNTITLED_ARTIFACT,
    at,
  };
  return true;
}

function applyList(index: ArtifactIndex, at: number, call: ArtifactCall, answer: Fields): boolean {
  if (!Array.isArray(answer.artifacts)) return false;
  // "all" and "shared" also name what others made and shared with you.
  if (call.narrowed || (call.scope && call.scope !== 'mine')) return false;
  let changed = false;
  const ids: string[] = [];
  for (const raw of answer.artifacts) {
    const row = fields(raw);
    const link = parseArtifactUrl(row.url);
    if (!link) continue;
    ids.push(link.id);
    const parsed = Date.parse(String(row.updatedAt));
    const updated = Number.isNaN(parsed) ? at : parsed;
    const title = cleanTitle(row.title);
    const current = index.artifacts[link.id];
    if (!current) {
      index.artifacts[link.id] = { ...link, title: title ?? UNTITLED_ARTIFACT, at: updated };
      changed = true;
    } else if (updated > current.at) {
      current.at = updated;
      if (title) current.title = title;
      changed = true;
    }
  }
  // Only a listing that reached the end says what no longer exists.
  const whole = answer.total === ids.length && ids.length > 0;
  if (whole && at > (index.fullList?.at ?? 0)) {
    index.fullList = { at, ids };
    changed = true;
  }
  return changed;
}

function applyDelete(index: ArtifactIndex, at: number, call: ArtifactCall): boolean {
  const link = parseArtifactUrl(call.url);
  if (!link || call.narrowed || at <= (index.deleted[link.id] ?? 0)) return false;
  index.deleted[link.id] = at;
  return true;
}

function absorbResult(
  index: ArtifactIndex,
  record: Fields,
  block: Fields,
  call: ArtifactCall,
): boolean {
  const at = Date.parse(String(record.timestamp));
  if (block.is_error === true || Number.isNaN(at)) return false;
  if (call.action === 'publish') {
    return !call.narrowed && applyPublish(index, record, at, call, block);
  }
  if (call.action === 'list') return applyList(index, at, call, fields(record.toolUseResult));
  if (call.action === 'delete') return applyDelete(index, at, call);
  return false;
}

/**
 * One transcript record into the index; true when the list may have changed.
 * A tool call and its answer are two records, maybe in different reads of the
 * file, so `pending` carries the call between them.
 *
 * Only `assistant` and `user` records count: Claude Code also writes
 * `api-request-blob` records that repeat old messages with no time of their own.
 */
export function absorbRecord(
  index: ArtifactIndex,
  record: Fields,
  pending: PendingCalls,
  fallbackSessionId?: string,
): boolean {
  if (record.type === 'custom-title' || record.type === 'ai-title') {
    const sessionId = text(record.sessionId) ?? fallbackSessionId;
    if (!sessionId) return false;
    const entry = (index.titles[sessionId] ??= {});
    const title = text(record.type === 'ai-title' ? record.aiTitle : record.customTitle);
    if (title && record.type === 'ai-title') entry.ai = title;
    else if (title) entry.custom = title;
    return !!title && sessionHasArtifact(index, sessionId);
  }
  const content = fields(record.message).content;
  if (!Array.isArray(content)) return false;
  let changed = false;
  for (const raw of content) {
    const block = fields(raw);
    if (record.type === 'assistant' && block.type === 'tool_use' && block.name === 'Artifact') {
      const id = text(block.id);
      if (id) pending[id] = callOf(fields(block.input));
    } else if (record.type === 'user' && block.type === 'tool_result') {
      const id = text(block.tool_use_id);
      const call = id ? pending[id] : undefined;
      if (!id || !call) continue;
      delete pending[id];
      if (absorbResult(index, record, block, call)) changed = true;
    }
  }
  return changed;
}

function sessionHasArtifact(index: ArtifactIndex, sessionId: string): boolean {
  return Object.values(index.artifacts).some((a) => a.sessionId === sessionId);
}

/** Copy each session's current name onto its artifacts; true if any changed. */
export function refreshAgentNames(
  index: ArtifactIndex,
  nameOf?: (sessionId: string) => string | undefined,
): boolean {
  let changed = false;
  const names = new Map<string, string | undefined>();
  const nameFor = (sessionId: string): string | undefined => {
    if (!names.has(sessionId)) {
      const title = index.titles[sessionId];
      const own = title ? pickSessionTitle(title.custom, title.ai) : undefined;
      names.set(sessionId, nameOf?.(sessionId) ?? own);
    }
    return names.get(sessionId);
  };
  for (const artifact of Object.values(index.artifacts)) {
    const name = artifact.sessionId ? nameFor(artifact.sessionId) : undefined;
    if (name && name !== artifact.agent) {
      artifact.agent = name;
      changed = true;
    }
  }
  return changed;
}

/**
 * The first artifacts had a `code/artifact/<uuid>` link; listings name them by
 * another id. A whole listing without that id still has the artifact: if one
 * row of it, with nobody behind it yet, has the very title, that is the one.
 */
function lendAgents(gone: ArtifactRecord[], shown: ArtifactRecord[]): ArtifactRecord[] {
  const out = shown.map((a) => ({ ...a }));
  for (const old of gone) {
    if (!old.sessionId || !old.url.includes('/code/artifact/')) continue;
    const same = out.filter((a) => a.title === old.title);
    if (same.length !== 1 || same[0].sessionId) continue;
    Object.assign(same[0], {
      sessionId: old.sessionId,
      agent: old.agent,
      folder: old.folder,
    });
  }
  return out;
}

/**
 * What the panel shows, newest first. Without what an agent deleted or a whole
 * listing no longer names (removed from the web, say). Order-free on purpose:
 * transcripts are read in no particular order.
 */
export function visibleArtifacts(index: ArtifactIndex): ArtifactEntry[] {
  const list = index.fullList;
  const listed = list ? new Set(list.ids) : undefined;
  const shown: ArtifactRecord[] = [];
  const gone: ArtifactRecord[] = [];
  for (const artifact of Object.values(index.artifacts)) {
    if ((index.deleted[artifact.id] ?? -1) >= artifact.at) continue;
    if (list && listed && !listed.has(artifact.id) && artifact.at < list.at - LIST_GRACE_MS) {
      gone.push(artifact);
    } else {
      shown.push(artifact);
    }
  }
  return lendAgents(gone, shown)
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, SHOWN_MAX)
    .map(({ id, url, title, at, agent, folder }) => ({
      id,
      url,
      title,
      at,
      ...(agent ? { agent } : {}),
      ...(folder ? { folder } : {}),
    }));
}
