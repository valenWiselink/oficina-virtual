/**
 * The Control view (asked 2026-11-06): what you have to do and when, large —
 * Pendientes, the agenda, Jarvis's chat — and the agents in the background,
 * as small chips. Pure rules here (tested).
 */
import type { AgentKind } from './agentViews.js';

/** Who comes first in the strip: who needs you, then who works, then the rest. */
const RANK: Record<AgentKind, number> = {
  needs: 0,
  meet: 1,
  research: 1,
  work: 1,
  think: 1,
  done: 2,
  idle: 3,
};

interface Rankable {
  kind: AgentKind;
  /** A held permission: it needs you, whatever its kind says. */
  permission?: unknown;
}

const rankOf = (v: Rankable) => (v.permission ? 0 : RANK[v.kind]);

/** The agents in the strip's order; within a rank, as the office lists them. */
export function controlOrder<T extends Rankable>(views: readonly T[]): T[] {
  return views
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rankOf(a.v) - rankOf(b.v) || a.i - b.i)
    .map(({ v }) => v);
}

/** Whether a chip calls for you (amber, first). */
export const callsForYou = (v: Rankable): boolean => rankOf(v) === 0;

/** The strip's title: how many there are and how many need you. */
export function stripTitle(views: readonly Rankable[]): string {
  if (views.length === 0) return 'Agentes';
  const needs = views.filter(callsForYou).length;
  const all = `Agentes (${views.length})`;
  return needs === 0 ? all : `${all} · ${needs} ${needs === 1 ? 'te necesita' : 'te necesitan'}`;
}
