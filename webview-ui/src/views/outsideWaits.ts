import type { AgentView } from './agentViews.js';

/**
 * A session outside the office (VS Code, the desktop app) that waits on
 * Valentín — a permission, a question, a «Te toca:» — never goes to «Te
 * necesita»: he is answering it where it runs, and Jarvis brought him one he
 * was already answering in the app (2026-11-28). It shows, as information,
 * in «Terminó» with where it waits; nothing counts it, knocks or notifies.
 */
export function outsideNeverNeeds(v: AgentView): AgentView {
  if (v.canSetRun || (v.kind !== 'needs' && !v.permission)) return v;
  return {
    ...v,
    kind: 'done',
    statusText: v.inClaudeApp ? 'Te espera en la app de Claude' : 'Te espera afuera',
    waitsElsewhere: true,
    permission: undefined,
    asksInTerminal: undefined,
    yourTurnId: undefined,
    yourTurn: undefined,
    prUrl: undefined,
    waitingSince: undefined,
    blocking: undefined,
  };
}
