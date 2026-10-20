/** Tools that read instead of change. Read alone is too common (every edit
 *  starts with one), so it only counts as research in a streak. */
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);
/** Subagent tool events carry only the status line; its prefix names the tool. */
const READING_STATUS =
  /^(Reading |Searching files|Searching code|Fetching web content|Searching the web)/;
const WEB_STATUS = /^(Fetching web content|Searching the web)/;

/** Consecutive reading tools that make it "researching" (web: at once). */
export const RESEARCH_STREAK = 3;
/** Stays researching this long after its last reading tool (no ping-pong
 *  between the library and the desk across a short pause). */
export const RESEARCH_LINGER_MS = 8000;

export interface ResearchTracker {
  toolStarted(id: number, toolName: string | undefined, status: string): void;
  stop(id: number): void;
  isResearching(id: number, now: number): boolean;
}

/**
 * Decides who is researching from their tool calls: any web search or fetch,
 * or a streak of reads/searches with no edit or command in between. Anything
 * that changes things (Edit, Write, Bash…) or the end of the turn stops it.
 */
export function createResearchTracker(clock: () => number = Date.now): ResearchTracker {
  const streak = new Map<number, number>();
  const until = new Map<number, number>();

  return {
    toolStarted(id, toolName, status) {
      const reading = toolName ? READING_TOOLS.has(toolName) : READING_STATUS.test(status);
      const web = toolName ? WEB_TOOLS.has(toolName) : WEB_STATUS.test(status);
      if (!reading) {
        streak.delete(id);
        until.delete(id);
        return;
      }
      const count = (streak.get(id) ?? 0) + 1;
      streak.set(id, count);
      if (web || count >= RESEARCH_STREAK || until.has(id)) {
        until.set(id, clock() + RESEARCH_LINGER_MS);
      }
    },
    stop(id) {
      streak.delete(id);
      until.delete(id);
    },
    isResearching(id, now) {
      return (until.get(id) ?? 0) > now;
    },
  };
}
