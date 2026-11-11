/**
 * When a pending ask is for, read from its own words: Jarvis writes «antes de
 * la una y veinte», «a las 23», «después de la demo», «el pase de esta
 * noche», «mañana jueves 12, apenas termine la demo», «el lunes». A deadline
 * («antes de…», «para las…») brings it forward as the time nears; a start
 * («a las…», «desde…», «después de…», «mañana», «el lunes») keeps it out of
 * «Ahora» until shortly before (asked 2026-11-06; 2026-11-11: «un pendiente
 * para mañana le aparece hoy como PRIMERO»). What Jarvis set by hand
 * (dejar_pendiente) wins over what is read here.
 *
 * Shared by the office (dejar_pendiente's «cuando») and the page (reading an
 * ask's words, the «Posponer» suggestions).
 */

export interface AskTimes {
  due?: number;
  notBefore?: number;
}

export interface MeetingTime {
  title: string;
  start: number;
  end: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** «mañana», «el lunes» with no hour: the start of the working day. */
export const MORNING_HOUR = 9;
const AFTERNOON_HOUR = 15;
const TONIGHT_HOUR = 20;
/** «para el viernes» with no hour: by the end of that working day. */
const END_OF_DAY_HOUR = 18;

const WORD_HOURS: Record<string, number> = {
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};
const WORD_MINUTES: Record<string, number> = {
  'y cinco': 5,
  'y diez': 10,
  'y cuarto': 15,
  'y veinte': 20,
  'y media': 30,
  'y cuarenta': 40,
  'menos cuarto': -15,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};
const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};
const SHORT_DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const TIME =
  '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:h|hs)?\\b|(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\\b(?:\\s+(y cinco|y diez|y cuarto|y veinte|y media|y cuarenta|menos cuarto))?';
const PERIOD = '(?:\\s+de la (mañana|tarde|noche))?';
const DUE = new RegExp(`\\b(?:antes de|para) las? (?:${TIME})${PERIOD}`, 'i');
const START = new RegExp(
  `(?:\\ba|\\bdesde|\\bdespués de|\\ba partir de) las? (?:${TIME})${PERIOD}`,
  'i',
);
/** «después de la demo», «apenas termine la demo», «al terminar la reunión». */
const AFTER_MEETING =
  /\b(?:después de|despues de|apenas termine|cuando termine|al terminar|terminada)\s+(?:la|el)\s+(demo|reunión|reunion|daily|[a-záéíóúñ]{3,})\b/i;
const TONIGHT = /\besta noche\b/i;
/** «mañana», not «de la mañana» nor «a la mañana» after a day («el lunes a la mañana»). */
const TOMORROW = /(?<!de la |a la |por la )\bmañana\b/i;
const TOMORROW_PART = /\bmañana (?:a|por) la (tarde|noche)\b/i;
const WEEKDAY =
  /\b(?:el |este |próximo |proximo )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+(\d{1,2})(?:\/(\d{1,2}))?)?\b/i;
const DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const DATE_WORDS =
  /\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const DUE_DAY =
  /\b(?:antes del?|para el|hasta el)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}\/\d{1,2})/i;

const midnight = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const atHour = (day: number, hour: number, minute = 0): number => {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};
const bare = (w: string): string => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The day a date in the words names, as its midnight, from `ref`'s day on. */
function namedDay(text: string, ref: number): number | undefined {
  const today = midnight(ref);
  const dated = (day: number, month: number, year?: number): number | undefined => {
    const base = new Date(ref);
    let d = new Date(year ?? base.getFullYear(), month, day);
    if (d.getMonth() !== month) return undefined;
    // «13/11» said in December is next year's.
    if (year === undefined && d.getTime() < today - 7 * DAY)
      d = new Date(base.getFullYear() + 1, month, day);
    return d.getTime();
  };
  const date = DATE.exec(text);
  if (date) {
    const year = date[3] ? Number(date[3].length === 2 ? `20${date[3]}` : date[3]) : undefined;
    return dated(Number(date[1]), Number(date[2]) - 1, year);
  }
  const words = DATE_WORDS.exec(text);
  if (words) return dated(Number(words[1]), MONTHS[words[2].toLowerCase()]);
  const weekday = WEEKDAY.exec(text);
  if (!weekday) return undefined;
  if (weekday[2]) {
    const month = weekday[3] ? Number(weekday[3]) - 1 : new Date(ref).getMonth();
    return dated(Number(weekday[2]), month);
  }
  const wanted = WEEKDAYS[bare(weekday[1])] ?? WEEKDAYS[weekday[1].toLowerCase()];
  const ahead = (wanted - new Date(today).getDay() + 7) % 7;
  return today + ahead * DAY;
}

/** The moment a matched time names on `day`, or the first one from `ref` on (30 min of grace). */
function momentOf(m: RegExpExecArray, ref: number, day: number | undefined): number | undefined {
  const [, digits, mins, word, wordMins, period] = m;
  let hour = digits !== undefined ? Number(digits) : WORD_HOURS[word.toLowerCase()];
  let minute =
    digits !== undefined ? Number(mins ?? 0) : (WORD_MINUTES[wordMins?.toLowerCase() ?? ''] ?? 0);
  if (minute < 0) {
    hour -= 1;
    minute += 60;
  }
  if (hour > 23 || minute > 59) return undefined;
  const base = day ?? midnight(ref);
  const at = (h: number) => atHour(base, h, minute);
  const p = period?.toLowerCase();
  if (p === 'tarde' || p === 'noche') return at(hour < 12 ? hour + 12 : hour);
  if (p === 'mañana' || hour > 12 || day !== undefined) {
    // «a las 3» on another day is the afternoon; 8 to 12 is the morning.
    if (p === undefined && day !== undefined && hour < 8) return at(hour + 12);
    return at(hour === 12 && p === 'mañana' ? 0 : hour);
  }
  // «a las tres» said at 13:00 is 15:00; «a las 10» said at 9:00 is 10:00.
  const grace = ref - 30 * MINUTE;
  const first = [at(hour), at((hour % 12) + 12)].sort((a, b) => a - b).find((t) => t >= grace);
  return first ?? at(hour) + DAY;
}

/** The next meeting `word` names («demo» → «Demo AgroActiva»), or any next one
 *  for «reunión»; on `day` when the words name one («mañana… la demo»). */
export function meetingNamed(
  word: string,
  meetings: readonly MeetingTime[],
  ref: number,
  day?: number,
): MeetingTime | undefined {
  const w = bare(word);
  const ahead = meetings
    .filter((m) => m.end > ref && (day === undefined || midnight(m.start) === day))
    .sort((a, b) => a.start - b.start);
  if (w === 'reunion') return ahead[0];
  return ahead.find((m) => bare(m.title).includes(w));
}

/** The day the words point to besides today: «mañana», «el lunes», «13/11». */
function dayOf(text: string, ref: number): number | undefined {
  const named = namedDay(text, ref);
  if (named !== undefined) return named;
  return TOMORROW.test(text) ? midnight(ref) + DAY : undefined;
}

/** The times an ask's words name, read as of `ref` (when it was asked). */
export function timesOf(
  text: string,
  ref: number,
  meetings: readonly MeetingTime[] = [],
): AskTimes {
  const times: AskTimes = {};
  const day = dayOf(text, ref);
  const otherDay = day !== undefined && day > midnight(ref) ? day : undefined;
  const due = DUE.exec(text);
  if (due) times.due = momentOf(due, ref, otherDay);
  else if (otherDay !== undefined && DUE_DAY.test(text)) {
    times.due = atHour(otherDay, END_OF_DAY_HOUR);
    return times;
  }
  const start = START.exec(text);
  const clocked = start && start.index !== due?.index ? momentOf(start, ref, otherDay) : undefined;
  const notBefore = clocked ?? startWithoutHour(text, ref, meetings, otherDay);
  if (notBefore !== undefined) times.notBefore = notBefore;
  if (times.due === undefined) delete times.due;
  return times;
}

/** A start with no clock: after a meeting, tonight, or another day's morning. */
function startWithoutHour(
  text: string,
  ref: number,
  meetings: readonly MeetingTime[],
  otherDay: number | undefined,
): number | undefined {
  const after = AFTER_MEETING.exec(text);
  const meeting = after ? meetingNamed(after[1], meetings, ref, otherDay) : undefined;
  if (meeting) return meeting.end;
  if (TONIGHT.test(text)) {
    const tonight = atHour(midnight(ref), TONIGHT_HOUR);
    return tonight > ref ? tonight : undefined;
  }
  if (otherDay === undefined) return undefined;
  const part = TOMORROW_PART.exec(text)?.[1]?.toLowerCase();
  const hour = part === 'tarde' ? AFTERNOON_HOUR : part === 'noche' ? TONIGHT_HOUR : MORNING_HOUR;
  return atHour(otherDay, hour);
}

export interface WhenRead {
  /** The moment it is for. */
  at: number;
  /** The meeting it waits for, by its title: it moves with the meeting. */
  after?: string;
}

/**
 * Jarvis's «cuando» for an ask: «14:45», «mañana», «mañana 11:00», «jueves 12
 * a las 11», «13/11 9:00», «el lunes», «esta noche», «después de: Demo
 * AgroActiva» (or «después de la demo»). Undefined when it cannot tell.
 */
export function readWhen(
  said: string,
  now: number,
  meetings: readonly MeetingTime[] = [],
): WhenRead | undefined {
  const text = said.trim();
  const clock = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(?:h|hs)?$/i.exec(text);
  if (clock) {
    const [h, m] = [Number(clock[1]), Number(clock[2] ?? 0)];
    if (h > 23 || m > 59) return undefined;
    const today = atHour(midnight(now), h, m);
    return { at: today < now - 6 * 60 * MINUTE ? today + DAY : today };
  }
  const titled = /^(?:después de|despues de)\s*:\s*(.+)$/i.exec(text);
  if (titled) {
    const wanted = bare(titled[1].trim());
    const meeting = meetings
      .filter((m) => m.end > now)
      .sort((a, b) => a.start - b.start)
      .find((m) => bare(m.title).includes(wanted) || wanted.includes(bare(m.title)));
    return meeting ? { at: meeting.end, after: meeting.title } : undefined;
  }
  // A bare «mañana», «el lunes», «13/11 9:00» reads as a start; «11:00» as «a las 11:00».
  const clocked = /\blas?\s+\d/i.test(text)
    ? text
    : text.replace(/(^|\s)(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:h|hs)\b)/i, '$1a las $2');
  const read = timesOf(
    /^(?:a |desde |después |antes |para )/i.test(clocked) ? clocked : `desde ${clocked}`,
    now,
    meetings,
  );
  const wordsAt = read.notBefore ?? timesOf(text, now, meetings).notBefore ?? read.due;
  if (wordsAt === undefined) return undefined;
  const after = AFTER_MEETING.exec(text);
  const meeting = after ? meetingNamed(after[1], meetings, now, dayOf(text, now)) : undefined;
  return { at: wordsAt, ...(meeting && meeting.end === wordsAt ? { after: meeting.title } : {}) };
}

/** «14:45» */
export function hourText(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** «11:00» today, «mañana 9:00», «jue 12, 9:00» further on. */
export function whenText(ms: number, now: number): string {
  const days = Math.round((midnight(ms) - midnight(now)) / DAY);
  if (days === 0) return hourText(ms);
  if (days === 1) return `mañana ${hourText(ms)}`;
  const d = new Date(ms);
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()}, ${hourText(ms)}`;
}
