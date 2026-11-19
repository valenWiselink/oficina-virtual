/**
 * What Valentín's answer to a «Te toca» means for it (asked 2026-11-19: an
 * answer closes it at once, it does not wait for Jarvis):
 * - `hand`: «hacelo vos», «encargate» — Jarvis does it (delegated to him).
 * - `leave`: «no sé», «como quieras» — Jarvis decides with his recommendation:
 *   nothing is left for Valentín, it closes.
 * - `notYet`: «todavía no», «más tarde», «no pude» — it stays pending.
 * - `trouble`: a question back or a problem («me tira error», «¿cuál?») — he
 *   answered but it is not done: it waits for the author's next step.
 * - `done`: anything else («listo», «hecho», «ya está», «sí», «la A», or what
 *   he says naming its id) — it closes, with «Deshacer».
 */
export type AnswerKind = 'hand' | 'leave' | 'notYet' | 'trouble' | 'done';

/** «listo», «ya lo hice», «sí», «no», «dale»: a short answer to what was just asked. */
export const SHORT_ANSWER =
  /^\s*(?:listo|lista|hecho|hecha|ya|dale|s[ií]|no|ok|okey|de una|perfecto|joya|confirmo|confirmado|aprobado|corrid[oa]|mergead[oa]|nose|no s[eé]|ni idea|como quieras|lo que (?:vos )?(?:recomiendes|digas|te parezca)|decid[ií] vos|eleg[ií] vos|hacelo(?: vos)?|encargate|ocupate|dale vos|lo hac[eé]s vos|todav[ií]a no|a[uú]n no|m[aá]s tarde|ahora no|despu[eé]s|en un rato|no pude|no puedo|me (?:tira|da|sale) (?:un )?error|tira error|da error|no anda|no funciona|no me deja|falla|fall[oó])(?!\p{L})/iu;
/** He hands it to Jarvis: «hacelo vos», «encargate». */
const HAND_TO_JARVIS =
  /^\s*(?:hacelo(?: vos)?|encargate|ocupate|dale vos|lo hac[eé]s vos)(?!\p{L})/iu;
/** He leaves the choice to Jarvis: «no sé», «como quieras». */
const LEAVE_TO_JARVIS =
  /^\s*(?:nose|no s[eé]|ni idea|como quieras|lo que (?:vos )?(?:recomiendes|digas|te parezca)|decid[ií] vos|eleg[ií] vos)(?!\p{L})/iu;
/** Not done yet: it stays. */
const NOT_YET =
  /^\s*(?:todav[ií]a no|a[uú]n no|m[aá]s tarde|ahora no|despu[eé]s|luego|en un rato|ma[ñn]ana|no pude|no puedo|no lleg(?:o|u[eé])|esper[aá]|ya voy|lo hago (?:despu[eé]s|luego|ma[ñn]ana|en un rato))(?!\p{L})/iu;
/** A question back or a problem: answered, not done. */
const TROUBLE =
  /\?|(?<!\p{L})(?:error(?:es)?|falla|fall[oó]|no anda|no funciona|no (?:me )?(?:deja|carga|abre|aparece|encuentro|sale|veo|conecta|arranca)|se rompi[oó]|rompe|problema|no se puede)(?!\p{L})/iu;

export function answerKind(said: string): AnswerKind {
  if (HAND_TO_JARVIS.test(said)) return 'hand';
  if (LEAVE_TO_JARVIS.test(said)) return 'leave';
  if (NOT_YET.test(said)) return 'notYet';
  if (TROUBLE.test(said)) return 'trouble';
  return 'done';
}
