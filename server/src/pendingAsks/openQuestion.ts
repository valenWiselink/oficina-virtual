import { teTocaLine } from '../agentIdentity.js';

const TEXT_MAX = 240;

/** Courtesy, not a decision: «¿En qué lo ayudo?», «¿Algo más?», «¿Me escucha?». */
const SMALL_TALK =
  /^¿\s*(?:(?:y\s+)?en qué (?:más )?(?:l[oae]s?|te) (?:ayudo|puedo ayudar|sirvo)|me (?:escucha|oye)|seguimos\s*\?)|algo más\b/i;

/** Quoted words keep their length but stop counting as the speaker's own:
 *  «¿A qué venís?» is a screen's title, `x?` is code. */
function maskQuotes(text: string): string {
  const blank = (m: string) => ' '.repeat(m.length);
  return text
    .replace(/`[^`\n]*`/g, blank)
    .replace(/«[^»\n]*»/g, blank)
    .replace(/"[^"\n]*"/g, blank)
    .replace(/“[^”\n]*”/g, blank);
}

/** The last paragraph without the lines it quotes (a message for someone else). */
function lastParagraph(reply: string): string | undefined {
  const withoutCode = reply.replace(/```[\s\S]*?```/g, '');
  const paragraphs = withoutCode
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .filter((line) => !/^\s*>/.test(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return paragraphs.at(-1);
}

function clip(text: string): string {
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text;
}

/**
 * The question an answer leaves for Valentín without a «Te toca:» line, if any:
 * Jarvis ending with «¿Ya puedo dejar que los agentes vuelvan a usar el
 * navegador?» waits on him just the same (2026-11-06). Only its own last
 * paragraph counts, only a real «¿…?» of its own (not quoted, not a blockquote
 * for someone else, not «¿En qué lo ayudo?»), and only with an answer that has
 * no «Te toca:» — that one already goes to Pendientes. Returns the sentence
 * that holds the question and what follows it in that paragraph.
 */
export function openQuestionOf(reply: string): string | undefined {
  if (teTocaLine(reply)) return undefined;
  const paragraph = lastParagraph(reply);
  if (!paragraph) return undefined;
  const masked = maskQuotes(paragraph);
  return questionIn(paragraph, masked) ?? waitIn(paragraph, masked);
}

/** Where the sentence holding `index` starts (after «. », «? » or «! »). */
function sentenceStart(masked: string, index: number): number {
  const before = masked.slice(0, index);
  const end = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('? '),
    before.lastIndexOf('! '),
  );
  return end < 0 ? 0 : end + 2;
}

/** Its last «¿…?», from the start of its sentence («Lo de Andy es lo primero:
 *  ¿le aviso…?») to the end of the paragraph (the reason that follows). */
function questionIn(paragraph: string, masked: string): string | undefined {
  const last = [...masked.matchAll(/¿[^¿?]*\?/g)].at(-1);
  if (last?.index === undefined) return undefined;
  const question = paragraph.slice(last.index, last.index + last[0].length);
  if (SMALL_TALK.test(question.trim())) return undefined;
  return clip(paragraph.slice(sentenceStart(masked, last.index)).trim());
}

const TELL_ME = /\b(?:avíseme|avisame|dígame|dígamelo|decime|confírmeme|confirmame)\b/i;
/** «Cuando quiera, dígame» offers; «cuando vuelva» is about him, not a task. */
const NO_TASK = /\bcuando (?:lo |la )?(?:quiera|pueda|prefiera|guste|necesite|vuelva|regrese)\b/i;

/**
 * «Cuando salga de la reunión, avíseme y se lo habilito»: no question mark,
 * but Jarvis waits on him all the same. Only with «cuando» (something he has
 * to do or see happen), never with «si» («si falla, avíseme» is just in case).
 */
function waitIn(paragraph: string, masked: string): string | undefined {
  // Clauses end at «. », «? », «! » or «;» — «la 2.0» goes on.
  for (const m of masked.matchAll(/(?:[^.!?;]|[.!?](?!\s|$))+[.!?;]?/g)) {
    const sentence = m[0];
    if (!TELL_ME.test(sentence) || !/\bcuando\b/i.test(sentence)) continue;
    if (/\bsi\b/i.test(sentence) || NO_TASK.test(sentence)) continue;
    const start = m.index ?? 0;
    return clip(paragraph.slice(start, start + sentence.length).trim());
  }
  return undefined;
}
