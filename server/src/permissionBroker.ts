import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { PERMISSION_DECISION_WAIT_MS } from './constants.js';

/** What the office can answer. Mirrors Claude Code's PermissionRequest decision. */
export type PermissionDecision = { behavior: 'allow' } | { behavior: 'deny'; message?: string };

/** Why a held request ended: decided in the office, answered in the terminal
 *  (or the hook went away), the session moved on, or the hold expired. */
export type PermissionOutcome = 'allow' | 'deny' | 'terminal' | 'expired';

/** A PermissionRequest waiting for an answer, as the office shows it. */
export interface PendingPermission {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  createdAt: number;
}

interface HeldRequest extends PendingPermission {
  resolve: (decision: PermissionDecision | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PermissionBrokerEvents {
  /** A request is now answerable from the office. */
  onPending: (request: PendingPermission) => void;
  /** A request is no longer answerable; the card must go away. */
  onResolved: (request: PendingPermission, outcome: PermissionOutcome) => void;
}

/**
 * Holds Claude Code PermissionRequest hooks open until the office decides.
 *
 * Claude Code shows its own terminal prompt in parallel and takes whichever
 * answer comes first, so the broker never blocks the user: every way a
 * request can end without an office decision resolves it with `null`, which
 * the hook script turns into "print nothing" (the terminal keeps the say).
 * The broker's other job is truthfulness: a card must disappear as soon as
 * the request stops being real, or the office lies.
 */
export class PermissionBroker {
  private readonly held = new Map<string, HeldRequest>();

  constructor(
    private readonly events: PermissionBrokerEvents,
    private readonly waitMs = PERMISSION_DECISION_WAIT_MS,
  ) {}

  /**
   * Hold one PermissionRequest. Resolves with the office's decision, or `null`
   * when the request ends any other way. `signal` aborts when the hook's HTTP
   * connection closes (Claude Code killed the hook after a terminal answer).
   */
  hold(event: Record<string, unknown>, signal?: AbortSignal): Promise<PermissionDecision | null> {
    const sessionId = typeof event.session_id === 'string' ? event.session_id : '';
    const toolName = typeof event.tool_name === 'string' ? event.tool_name : '';
    if (!sessionId || !toolName || signal?.aborted) return Promise.resolve(null);
    // A question is answered with its options in the terminal, not approved:
    // an approval card for it would be a lie (and "Aprobar" has no answer).
    if (NOT_APPROVALS.has(toolName)) return Promise.resolve(null);

    const toolInput =
      typeof event.tool_input === 'object' && event.tool_input !== null
        ? (event.tool_input as Record<string, unknown>)
        : {};
    const requestId = randomUUID();

    return new Promise((resolve) => {
      const request: HeldRequest = {
        requestId,
        sessionId,
        toolName,
        toolInput,
        cwd: typeof event.cwd === 'string' ? event.cwd : undefined,
        createdAt: Date.now(),
        resolve,
        timer: setTimeout(() => this.finish(requestId, null, 'expired'), this.waitMs),
      };
      this.held.set(requestId, request);
      signal?.addEventListener('abort', () => this.finish(requestId, null, 'terminal'), {
        once: true,
      });
      this.events.onPending(toPublic(request));
    });
  }

  /** Apply a decision from the office. Returns false when the request is gone
   *  (already answered in the terminal, expired, or never existed). */
  decide(requestId: string, decision: PermissionDecision): boolean {
    if (!this.held.has(requestId)) return false;
    this.finish(requestId, decision, decision.behavior);
    return true;
  }

  /** Feed every non-PermissionRequest hook event: the ones that prove a held
   *  request was settled elsewhere end it. */
  observe(event: Record<string, unknown>): void {
    const sessionId = typeof event.session_id === 'string' ? event.session_id : '';
    if (!sessionId || this.held.size === 0) return;
    switch (event.hook_event_name) {
      case 'PostToolUse':
      case 'PostToolUseFailure':
        this.toolFinished(sessionId, String(event.tool_name ?? ''), event.tool_input);
        break;
      case 'Stop':
      case 'SessionEnd':
        this.sessionSettled(sessionId);
        break;
    }
  }

  /**
   * A tool ran or failed: if it is the call a held request was asking about,
   * the terminal answered it. Matching on name + input (not merely the
   * session) keeps parallel subagents' tools from clearing a real request.
   * The finished input may carry more than was asked (an answered question
   * gains `answers`), so the asked fields must all match, not the whole object.
   */
  toolFinished(sessionId: string, toolName: string, toolInput: unknown): void {
    for (const request of [...this.held.values()]) {
      if (
        request.sessionId === sessionId &&
        request.toolName === toolName &&
        containsInput(toolInput, request.toolInput)
      ) {
        this.finish(request.requestId, null, 'terminal');
      }
    }
  }

  /** The session's turn or the session itself ended: nothing it asked is pending. */
  sessionSettled(sessionId: string): void {
    for (const request of [...this.held.values()]) {
      if (request.sessionId === sessionId) this.finish(request.requestId, null, 'terminal');
    }
  }

  /** Everything still answerable, oldest first (for a client that just connected). */
  pending(): PendingPermission[] {
    return [...this.held.values()].sort((a, b) => a.createdAt - b.createdAt).map(toPublic);
  }

  /** Release every hook (server shutdown): the terminals keep their prompts. */
  dispose(): void {
    for (const requestId of [...this.held.keys()]) this.finish(requestId, null, 'expired');
  }

  private finish(
    requestId: string,
    decision: PermissionDecision | null,
    outcome: PermissionOutcome,
  ): void {
    const request = this.held.get(requestId);
    if (!request) return;
    this.held.delete(requestId);
    clearTimeout(request.timer);
    request.resolve(decision);
    this.events.onResolved(toPublic(request), outcome);
  }
}

function toPublic(request: HeldRequest): PendingPermission {
  const { requestId, sessionId, toolName, toolInput, cwd, createdAt } = request;
  return { requestId, sessionId, toolName, toolInput, cwd, createdAt };
}

/** Tools Claude Code routes through PermissionRequest that are not approvals. */
const NOT_APPROVALS = new Set(['AskUserQuestion']);

/** True when every field that was asked about is in the finished call unchanged. */
function containsInput(finished: unknown, asked: Record<string, unknown>): boolean {
  if (typeof finished !== 'object' || finished === null) return false;
  const done = finished as Record<string, unknown>;
  return Object.keys(asked).every((key) => isDeepStrictEqual(done[key], asked[key]));
}
