import type { HookHealth } from '../../../core/src/messages.js';

/** What the hook-health notice says: the headline and one line of what to do. */
export interface HookHealthText {
  title: string;
  line: string;
  /** The latest error, word for word, for whoever helps you (tooltip). */
  detail?: string;
}

export const HOOK_HEALTH_TITLE = 'La oficina no está recibiendo bien lo que hacen tus agentes';

/** "9 s" for a duration in ms (at least 1 s). */
function seconds(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))} s`;
}

/**
 * Slow (Claude Code cut them for taking too long) or broken (they failed):
 * the two need different words. Slow is mostly a busy PC; broken is mostly a
 * hook written for another version of the office, which reinstalling fixes.
 */
export function hookHealthText(status: HookHealth): HookHealthText {
  const n = status.failures;
  const mostlySlow = status.timedOut * 2 >= n;
  if (mostlySlow) {
    const upTo = status.slowestMs ? `, hasta ${seconds(status.slowestMs)}` : '';
    return {
      title: HOOK_HEALTH_TITLE,
      line: `Los avisos de Claude tardan en llegar (${n} en 10 min${upTo}) y puede mostrar estados viejos. Reinstalalos; si sigue, cerrá los agentes que no uses.`,
      detail: status.lastError,
    };
  }
  return {
    title: HOOK_HEALTH_TITLE,
    line: `${n} avisos de Claude fallaron en 10 min y puede mostrar estados viejos. Reinstalalos; si sigue, reiniciá la oficina.`,
    detail: status.lastError,
  };
}
