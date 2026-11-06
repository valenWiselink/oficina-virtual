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
  /** Finished and no longer needed («para cerrar»): last of all. */
  closeSuggestedAt?: number;
}

const TO_CLOSE = 4;

const rankOf = (v: Rankable) =>
  v.permission ? 0 : v.closeSuggestedAt !== undefined ? TO_CLOSE : RANK[v.kind];

/** Whether the office finds it no longer needed. */
export const toClose = (v: Rankable): boolean => rankOf(v) === TO_CLOSE;

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
  const spare = views.filter(toClose).length;
  return [
    `Agentes (${views.length})`,
    needs > 0 ? `${needs} ${needs === 1 ? 'te necesita' : 'te necesitan'}` : undefined,
    spare > 0 ? `${spare} para cerrar` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
