/**
 * The choices an answer leaves you, so the office can offer one tap for each:
 * "Andá con la 2." for an option of a numbered list, "Como recomendás" when
 * the agent recommended one. Most numbered lists are steps or a summary of
 * what got done, not a choice, so a list counts only with a choice asked
 * right around it ("¿Cuál preferís?", "Tenés dos opciones:", "elegí 1 o 2").
 * Several questions in one answer (a list of decisions, or two lists of
 * options) get only "Como recomendás": a single number would not answer them.
 *
 * Measured against 1343 real answers (2026-10-10 to 21): see the tests.
 */

export interface ReplyChoice {
  /** Its number in the list. */
  n: number;
  /** Its short title, for the button. */
  label: string;
}

export interface ReplyChoices {
  /** One per option of the list (empty when only a recommendation fits). */
  options: ReplyChoice[];
  /** The agent recommended something you can just accept. */
  recommends: boolean;
}

interface NumberedList {
  items: Array<{ n: number; text: string }>;
  start: number;
  end: number;
}

/** "1. text", "1) text", "**1.** text", "**1. Title.** text" (up to 3 spaces in). */
const ITEM = /^\s{0,3}(?:\*\*)?(\d{1,2})[.)](?:\*\*)?\s+(.+)$/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const FENCE = /^\s*```/;
/** Lines allowed between two items of the same list (their own paragraphs). */
const MAX_GAP = 10;
/** More options than this is not a choice to make with buttons. */
const MAX_OPTIONS = 6;
const LABEL_MAX = 32;

/** A choice asked around a list. */
const CHOICE = new RegExp(
  [
    '¿\\s*(?:con\\s+|por\\s+)?cu[aá]l',
    'qu[eé]\\s+(?:opci[oó]n|camino|alternativa|variante)',
    '\\bprefer[ií]s\\b',
    '\\bte\\s+gusta\\s+m[aá]s\\b',
    '\\belijas\\b',
    // "elegí una", "decidí entre…", "decime cuál"; not "elegir la build
    // nueva", "al elegir un ítem" or "para decidir qué va a E:".
    '\\b(?:eleg[ií]|elegir|elegime|decid[ií]|decidir|decime)\\s+(?:entre|un[ao]\\b|cu[aá]l|la\\s+\\d|el\\s+\\d|\\d)',
    // "1, 2 o 3", "la 1 o la 2"
    '\\b\\d\\s*(?:,\\s*(?:la\\s+|el\\s+)?\\d\\s*)*\\s+[ou]\\s+(?:la\\s+|el\\s+)?\\d\\b',
    '\\b(?:opciones|caminos|alternativas|variantes)\\b',
    // "Recomiendo la 1", "Mi recomendación es hacer ahora la 1", "¿Hago la 1?"
    '\\b(?:recomiendo|recomendaci[oó]n|ir[ií]a|quedo|hago|hacemos|vamos)\\b[^.?\\n]{0,30}\\bla\\s+\\d\\b',
  ].join('|'),
  'i',
);
/** A list introduced as several questions or decisions, not as options. */
const SEVERAL = /decisiones|\bdecidan\b|preguntas|\bdudas\b/i;
/** A list introduced as steps, changes or findings. */
const NOT_A_CHOICE =
  /pasos|\bplan\b|\borden\b|\bhice\b|hicimos|cambios|\bcambi[eé]\b|arregl|correg|qu[eé] hace|instrucciones|para probar|\bprob[aá]\b|verific|lo que falta|pendientes|encontr[eé]|hallazgos|errores|problemas|\bagrega\b|\bincluye\b|resumen|commits/i;
const RECOMMENDS =
  /\brecomiendo\b|\brecomendar[ií]a\b|\bmi\s+recomendaci[oó]n\b|\(recomendad[ao]\)|\byo\s+(?:ir[ií]a|me\s+quedo|me\s+quedar[ií]a|elegir[ií]a|eligir[ií]a|har[ií]a|optar[ií]a)\b|\bir[ií]a\s+(?:por|con)\s+(?:la|el)\b|\bme\s+inclino\s+por\b|\bsugiero\b|\bmi\s+voto\b/i;

/** The numbered lists of an answer (two or more items, numbered 1, 2, …). */
function numberedLists(lines: string[]): NumberedList[] {
  const lists: NumberedList[] = [];
  let current: NumberedList | null = null;
  let inFence = false;
  const close = () => {
    if (current && current.items.length >= 2) lists.push(current);
    current = null;
  };
  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) return;
    if (HEADING.test(line)) return close();
    const m = ITEM.exec(line);
    if (!m) {
      if (current && i - current.end > MAX_GAP) close();
      return;
    }
    const n = Number(m[1]);
    const text = m[2];
    if (n === 1) {
      close();
      current = { items: [{ n, text }], start: i, end: i };
    } else if (current && n === current.items[current.items.length - 1].n + 1) {
      current.items.push({ n, text });
      current.end = i;
    } else {
      close();
    }
  });
  close();
  return lists;
}

/** Up to `count` non-empty lines before `from`, nearest last. */
function linesBefore(lines: string[], from: number, count: number): string {
  const out: string[] = [];
  for (let i = from - 1; i >= 0 && out.length < count; i--) {
    if (lines[i].trim()) out.unshift(lines[i]);
  }
  return out.join('\n');
}

/** A line that opens with something bold ("**Qué vas a poder gestionar:**",
 *  "**Sobre Intro.js:** no lo usaría…"): the next topic, unless it is the
 *  agent's recommendation on this list. */
const SECTION = /^\s*\*\*[^*]+\*\*/;

/** Up to `count` non-empty lines after a list, past its last item's own
 *  indented paragraphs and bullets, until the next topic starts. */
function linesAfter(lines: string[], from: number, count: number): string {
  const out: string[] = [];
  for (let i = from + 1; i < lines.length && out.length < count; i++) {
    const line = lines[i];
    if (HEADING.test(line) || (SECTION.test(line) && !RECOMMENDS.test(line))) break;
    if (!line.trim() || /^\s{2,}\S|^\s*[-*•]\s/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

/** The line right before the list is a question ("¿Cómo seguimos?"). */
const ASKED_BEFORE = /\?\s*\**:?\s*$/;

type ListKind = 'options' | 'several' | 'none';

function kindOf(lines: string[], list: NumberedList): ListKind {
  const intro = linesBefore(lines, list.start, 2);
  // What introduces the list itself is the line right above it.
  const lead = linesBefore(lines, list.start, 1);
  const outro = linesAfter(lines, list.end, 3);
  const questions = list.items.filter((it) => it.text.includes('?')).length;
  if (SEVERAL.test(lead) || questions >= 2) return 'several';
  if (NOT_A_CHOICE.test(lead)) return 'none';
  return ASKED_BEFORE.test(lead) || CHOICE.test(intro) || CHOICE.test(outro) ? 'options' : 'none';
}

/** An option's short title: its bold part, else its first clause. */
export function optionLabel(text: string): string {
  const bold = /^\*\*(.+?)\*\*/.exec(text.trim())?.[1];
  const raw = bold ?? text.split(/:\s|\s[—–-]\s|\.\s|\s\(|,\s/)[0];
  const flat = raw
    .replace(/[*_`]/g, '')
    .replace(/[.:,;]+$/, '')
    .trim();
  if (flat.length <= LABEL_MAX) return flat;
  const cut = flat.slice(0, LABEL_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > LABEL_MAX / 2 ? cut.slice(0, space) : cut}…`;
}

/** It asks something: a "Te toca" for you, or a question near its end. */
function asksSomething(reply: string, yourTurn: string | undefined): boolean {
  return !!yourTurn || reply.slice(-800).includes('?');
}

/**
 * The choices an answer leaves for one tap, or undefined when there is none
 * worth a button. `yourTurn` is the answer's "Te toca" (agentIdentity.ts).
 */
export function replyChoices(reply: string, yourTurn?: string): ReplyChoices | undefined {
  const lines = reply.split('\n');
  const kinds = numberedLists(lines).map((list) => ({ list, kind: kindOf(lines, list) }));
  const options = kinds.filter((k) => k.kind === 'options');
  const several = kinds.some((k) => k.kind === 'several') || options.length > 1;
  const recommends = RECOMMENDS.test(reply) && asksSomething(reply, yourTurn);
  if (!several && options.length === 1 && options[0].list.items.length <= MAX_OPTIONS) {
    return {
      options: options[0].list.items.map((it) => ({ n: it.n, label: optionLabel(it.text) })),
      recommends,
    };
  }
  return recommends ? { options: [], recommends: true } : undefined;
}
