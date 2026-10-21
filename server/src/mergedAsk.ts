import type { PrState, PrStatus } from '../../core/src/messages.js';
import type { AgentState } from './types.js';

/**
 * A "te toca" that only asks to merge (or review) one pull request is done
 * when that PR gets merged: "mergear el PR #2563 y avisarme" (measured
 * 2026-10-20: 50 of 118 asks ended in "avisarme", and the operator wrote
 * "ya mergié…" by hand 7 times in 3 days). An ask that only mentions a PR
 * among other things ("cargar el secret … (están en el PR #139)") is not
 * settled by its merge, and neither is one with more to do after it
 * ("mergear el #107 y probarlo en el iPhone").
 */

export interface PrAsk {
  url: string;
  number: number;
  /** It asked to be told ("… y avisarme"). */
  notify: boolean;
}

const PR_LINK = /https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/pull\/(\d+)/g;
/** "mergear el PR #12", "revisar y mergear la PR #12", "aprobar #12"… */
const ASK_HEAD =
  /^(?:revis(?:ar|á)(?:\s+y\s+(?:merge(?:ar|á)|aprob(?:ar|á)))?|merge(?:ar|á)|aprob(?:ar|á)(?:\s+y\s+merge(?:ar|á))?)\s+(?:el\s+|la\s+)?(?:PR\s+|pull\s+request\s+)?#(\d+)\b/i;
/** What may follow the PR without asking anything else. */
const QUALIFIERS = [
  /^\s*\([^)]*\)/, // "(wiselink_frontend_webapp)"
  /^\s+(?:del?|en)\s+(?:repo\s+)?[\w./-]+/i, // "del webapp", "de wiselink-flutter"
  /^\s+a\s+(?:main|develop|master)\b/i,
  /^\s+cuando\s+(?:puedas|quieras|retomes)\b/i,
];
const NOTIFY_TAIL =
  /^\s*,?\s*y\s+(?:me\s+)?(?:avisarme|avis[aá]me|avis[aá]s|me\s+avis[aá]s)\b(?:\s+(?:para|cuando|así)\b.*)?$/i;

/**
 * The PR a "te toca" is only about, with its link (the office can only watch
 * a PR it has the URL of): from the same answer, else from one the agent
 * wrote before (`earlier`, by number: "mergear el #105" rarely repeats it).
 */
export function prAskOf(
  yourTurn: string,
  reply: string,
  earlier?: ReadonlyMap<number, string>,
): PrAsk | undefined {
  // A link written in the ask itself reads as its number.
  const text = yourTurn.replace(PR_LINK, (_m, n: string) => `#${n}`).trim();
  const head = ASK_HEAD.exec(text);
  if (!head) return undefined;
  const number = Number(head[1]);
  let rest = text.slice(head[0].length);
  for (let changed = true; changed;) {
    changed = false;
    for (const q of QUALIFIERS) {
      const m = q.exec(rest);
      if (m) {
        rest = rest.slice(m[0].length);
        changed = true;
      }
    }
  }
  const notify = NOTIFY_TAIL.test(rest);
  if (!notify && !/^\s*[.!]?\s*$/.test(rest)) return undefined;
  const url =
    [...reply.matchAll(PR_LINK)].find((m) => Number(m[1]) === number)?.[0] ?? earlier?.get(number);
  return url ? { url, number, notify } : undefined;
}

/** PR links remembered per agent (the latest per number wins). */
const KEEP_PR_LINKS = 30;

/** Remember the pull requests an answer links, by number. */
export function rememberPrLinks(known: Map<number, string>, reply: string): void {
  for (const m of reply.matchAll(PR_LINK)) {
    const n = Number(m[1]);
    known.delete(n);
    known.set(n, m[0]);
  }
  for (const n of known.keys()) {
    if (known.size <= KEEP_PR_LINKS) break;
    known.delete(n);
  }
}

/** What the office already knows of a PR's state (prWatch); set once it runs. */
let prState: (url: string) => PrState | undefined = () => undefined;

export function setPrStates(lookup: (url: string) => PrState | undefined): void {
  prState = lookup;
}

export function prStateOf(url: string): PrState | undefined {
  return prState(url);
}

/** The message the office writes to an agent whose PR it saw merged. */
export function mergedMessage(number: number): string {
  return `Ya mergeé el PR #${number}.`;
}

/** Its turn is over and nothing it started is still running. */
export function isQuiet(agent: AgentState, backgroundRunning: number): boolean {
  return agent.isWaiting && agent.activeToolIds.size === 0 && backgroundRunning === 0;
}

export interface SettleDeps {
  /** The office terminal of an agent, if it has one. */
  terminalOf: (id: number) => { write(data: string): void } | undefined;
  /** Write a message into a terminal and send it. */
  send: (terminal: { write(data: string): void }, text: string) => void;
  /** Background work still running for an agent. */
  backgroundOf: (agent: AgentState) => number;
}

/**
 * A PR got merged: every agent whose "te toca" was only that PR has it done.
 * When the ask said "avisarme", the merge was seen happen (not learned at
 * start-up) and the agent sits idle in an office terminal, the office tells
 * it right away; otherwise the card offers "Avisarle". Returns the ids of
 * the agents that changed.
 */
export function settleMergedAsks(
  agents: Iterable<[number, AgentState]>,
  status: PrStatus,
  live: boolean,
  deps: SettleDeps,
): number[] {
  if (status.state !== 'merged') return [];
  const changed: number[] = [];
  for (const [id, agent] of agents) {
    const turn = agent.yourTurn;
    const ask = turn?.prAsk;
    if (!turn || !ask || ask.url !== status.url || turn.merged) continue;
    const terminal = deps.terminalOf(id);
    const tell = live && ask.notify && !!terminal && isQuiet(agent, deps.backgroundOf(agent));
    if (tell) deps.send(terminal!, mergedMessage(ask.number));
    turn.merged = { number: ask.number, url: ask.url, told: tell };
    changed.push(id);
  }
  return changed;
}
