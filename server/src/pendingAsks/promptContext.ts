import type { StoredAsk } from './pendingAsks.js';

/**
 * What Jarvis reads with every message Valentín sends him: the asks still
 * open, with their ids. Before, he only saw them when he remembered to call
 * `pendientes`, and asks that no longer applied stayed open (asked
 * 2026-11-19). Delivered by a UserPromptSubmit hook only his session has
 * (supervision.ts), as context the model reads before the message.
 */
const MAX_SHOWN = 15;
const TEXT_MAX = 140;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function line(ask: StoredAsk, now: number): string {
  const notes = [
    `de ${ask.from}`,
    ago(now - (ask.touchedAt ?? ask.at)),
    ask.delegatedTo ? `lo hace «${ask.delegatedTo.agent}»` : undefined,
    ask.answeredAt !== undefined
      ? `ya te contestó (${ask.answeredHow ?? 'en el chat'})`
      : undefined,
    ask.seemsDone ? `parece resuelto: ${ask.seemsDone}` : undefined,
    ask.question ? 'pregunta tuya sin «Te toca:»' : undefined,
  ].filter(Boolean);
  return `- [${ask.id}] ${clip(ask.text, TEXT_MAX)} · ${notes.join(' · ')}`;
}

export function openAsksContext(open: readonly StoredAsk[], now: number): string {
  if (open.length === 0) return '[Oficina] Valentín no tiene pendientes abiertos.';
  const shown = [...open].sort((a, b) => (b.touchedAt ?? b.at) - (a.touchedAt ?? a.at));
  const rest = shown.length - MAX_SHOWN;
  return [
    `[Oficina] Pendientes abiertos de Valentín (${open.length}), del más reciente al más viejo. ` +
      'Para reformular uno escribí «Te toca [pN]: …» (no se duplica); si uno ya no corresponde, ' +
      'cerralo con resolver_pendientes o cerrar_pendiente; si se lo pasás a un agente, poné su id ' +
      'en «pendiente» de lanzar_agente o escribir_a_agente. Si te contesta sin id («no sé», ' +
      '«hacelo vos»), la oficina lo ata al último «Te toca» que le dejaste.',
    ...shown.slice(0, MAX_SHOWN).map((a) => line(a, now)),
    ...(rest > 0 ? [`- y ${rest} más: llamá a pendientes para verlos.`] : []),
  ].join('\n');
}
