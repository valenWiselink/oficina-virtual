import type { UpdateState } from './desktopUpdates.js';

/** "un agente" / "3 agentes". */
export function agentsWord(n: number): string {
  return n === 1 ? 'un agente' : `${n} agentes`;
}

/** The office corner's answer to a check someone asked for (the tray's
 *  "Buscar actualizaciones"); undefined when there is nothing to say. A
 *  download in progress is said for as long as it lasts; the rest only
 *  while `fresh`. */
export function checkAnswerText(update: UpdateState, fresh: boolean): string | undefined {
  const check = update.lastCheck;
  if (!check?.manual) return undefined;
  if (update.status === 'downloading' && update.version) {
    return `Encontré la ${update.version}. La estoy bajando y te aviso acá.`;
  }
  if (!fresh) return undefined;
  if (check.outcome === 'none') return `Tenés la última versión (${update.current}).`;
  if (check.outcome === 'error') return 'No pude buscar actualizaciones ahora. Probá más tarde.';
  return undefined;
}

/** Ajustes → Ayuda: where things stand after "Buscar actualizaciones". */
export function settingsCheckText(update: UpdateState): string {
  if (!update.enabled) return 'Esta copia no se actualiza sola.';
  if (update.status === 'ready' && update.version) {
    return `La ${update.version} está lista para instalar: el aviso está arriba a la derecha.`;
  }
  if (update.status === 'downloading' && update.version) {
    return `Hay una nueva (${update.version}). La estoy bajando y te aviso cuando esté lista.`;
  }
  if (update.status === 'checking') return 'Buscando…';
  if (update.lastCheck?.outcome === 'error' || update.status === 'error') {
    return 'No pude buscar ahora. Probá más tarde.';
  }
  return 'Tenés la última versión.';
}
