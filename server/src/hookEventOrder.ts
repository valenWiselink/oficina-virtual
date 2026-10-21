import { HOOK_SPAWNED_AT_FIELD } from './constants.js';

/** How many finished tool calls / stopped subagents each agent remembers:
 *  enough for a burst of parallel calls, small enough to scan. */
const REMEMBERED_IDS = 200;

interface OrderState {
  finishedTools: string[];
  stoppedSubagents: string[];
  /** Stamps (ms) of the latest event of each sort that was applied. */
  turnEndedAt: number;
  toolStartAt: number;
  toolEndAt: number;
  permissionAt: number;
}

function remember(list: string[], id: string): void {
  if (list.includes(id)) return;
  list.push(id);
  if (list.length > REMEMBERED_IDS) list.shift();
}

function stringField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Keeps hook events that arrive out of order from rewriting newer state.
 *
 * The listen-only hooks run in the background (`async`), each in its own
 * process, so Claude Code no longer waits for one before firing the next and
 * they can reach the server in any order. The synchronous ones (Stop,
 * PermissionRequest, SessionStart/End) still arrive in order and anchor the
 * rest. Two facts decide:
 * - ids: PostToolUse names the call it closes (`tool_use_id`), SubagentStop
 *   the subagent (`agent_id`); a start for something already closed is stale;
 * - when Claude Code started the hook (the script's `oficina_hook_at`, else
 *   arrival): a tool start from before the last turn end belongs to that
 *   finished turn, an idle notice from before the last tool start was
 *   overtaken by new work, a permission notice from before a tool ended or
 *   the turn ended asks about something already settled.
 */
export class HookEventOrder {
  private readonly states = new Map<number, OrderState>();

  constructor(private readonly now: () => number = Date.now) {}

  /** When the event happened, as closely as we know it (never in the future). */
  stampOf(raw: Record<string, unknown>): number {
    const stamp = raw[HOOK_SPAWNED_AT_FIELD];
    const now = this.now();
    return typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0
      ? Math.min(stamp, now)
      : now;
  }

  /** Whether the event still tells the truth; remembers what it settles.
   *  False means drop it: newer events already said more. */
  admit(agentId: number, raw: Record<string, unknown>): boolean {
    const s = this.stateOf(agentId);
    const at = this.stampOf(raw);
    switch (raw.hook_event_name) {
      case 'PreToolUse':
        return this.admitToolStart(s, raw, at);
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        const id = stringField(raw, 'tool_use_id');
        if (id) remember(s.finishedTools, id);
        s.toolEndAt = Math.max(s.toolEndAt, at);
        return true;
      }
      case 'Notification':
        return this.admitNotification(s, raw, at);
      case 'PermissionRequest':
        s.permissionAt = Math.max(s.permissionAt, at);
        return true;
      case 'Stop':
      case 'SessionEnd':
        s.turnEndedAt = Math.max(s.turnEndedAt, at);
        return true;
      case 'SubagentStart': {
        const id = stringField(raw, 'agent_id');
        return !(id && s.stoppedSubagents.includes(id)) && at >= s.turnEndedAt;
      }
      case 'SubagentStop': {
        const id = stringField(raw, 'agent_id');
        if (id) remember(s.stoppedSubagents, id);
        return true;
      }
      default:
        return true;
    }
  }

  /** A tool start that predates the pending permission request is the call
   *  that asked (its start arrived late): it must not clear the request. */
  startedBeforePermission(agentId: number, raw: Record<string, unknown>): boolean {
    const s = this.states.get(agentId);
    if (!s || s.permissionAt <= s.turnEndedAt) return false;
    return this.stampOf(raw) < s.permissionAt;
  }

  /** The agent left the office: drop what it remembered. */
  forget(agentId: number): void {
    this.states.delete(agentId);
  }

  private admitToolStart(s: OrderState, raw: Record<string, unknown>, at: number): boolean {
    const id = stringField(raw, 'tool_use_id');
    if ((id && s.finishedTools.includes(id)) || at < s.turnEndedAt) return false;
    s.toolStartAt = Math.max(s.toolStartAt, at);
    return true;
  }

  private admitNotification(s: OrderState, raw: Record<string, unknown>, at: number): boolean {
    const type = raw.notification_type;
    if (type === 'permission_prompt') {
      // The PermissionRequest hook (synchronous) already raised it; a late
      // notice must not raise it again over a tool that already ran.
      return at >= s.turnEndedAt && at >= s.toolEndAt;
    }
    if (type === 'idle_prompt') {
      if (at < s.toolStartAt) return false;
      s.turnEndedAt = Math.max(s.turnEndedAt, at);
    }
    return true;
  }

  private stateOf(agentId: number): OrderState {
    let s = this.states.get(agentId);
    if (!s) {
      s = {
        finishedTools: [],
        stoppedSubagents: [],
        turnEndedAt: 0,
        toolStartAt: 0,
        toolEndAt: 0,
        permissionAt: 0,
      };
      this.states.set(agentId, s);
    }
    return s;
  }
}
