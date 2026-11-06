/**
 * When a pending ask is for, read from its own words: Jarvis writes «antes de
 * la una y veinte», «a las 23», «después de la demo», «el pase de esta
 * noche». A deadline («antes de…», «para las…») brings it forward as the time
 * nears; a start («a las…», «desde…», «después de…», «esta noche») keeps it
 * out of «Ahora» until shortly before (asked 2026-11-06: pendientes de tiempo
 * que no deberían pasar adelante antes de su hora). What Jarvis set by hand
 * (dejar_pendiente) wins over what is read here.
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

const TIME =
  '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:h|hs)?\\b|(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\\b(?:\\s+(y cinco|y diez|y cuarto|y veinte|y media|y cuarenta|menos cuarto))?';
const PERIOD = '(?:\\s+de la (mañana|tarde|noche))?';
const DUE = new RegExp(`\\b(?:antes de|para) las? (?:${TIME})${PERIOD}`, 'i');
const START = new RegExp(
  `(?:\\ba|\\bdesde|\\bdespués de|\\ba partir de) las? (?:${TIME})${PERIOD}`,
  'i',
);
const AFTER_MEETING = /\bdespués de la (demo|reunión|daily|[a-záéíóúñ]{3,})\b/i;
const TONIGHT = /\besta noche\b/i;
const TOMORROW = /(?<!de la )\bmañana\b/i;
const TONIGHT_HOUR = 20;

/** The moment a matched time names, the first one from `ref` on (30 min of grace). */
function momentOf(m: RegExpExecArray, ref: number, tomorrow: boolean): number | undefined {
  const [, digits, mins, word, wordMins, period] = m;
  let hour = digits !== undefined ? Number(digits) : WORD_HOURS[word.toLowerCase()];
  let minute =
    digits !== undefined ? Number(mins ?? 0) : (WORD_MINUTES[wordMins?.toLowerCase() ?? ''] ?? 0);
  if (minute < 0) {
    hour -= 1;
    minute += 60;
  }
  if (hour > 23 || minute > 59) return undefined;
  const day = new Date(ref);
  if (tomorrow) day.setDate(day.getDate() + 1);
  const at = (h: number) => {
    const d = new Date(day);
    d.setHours(h, minute, 0, 0);
    return d.getTime();
  };
  const p = period?.toLowerCase();
  if (p === 'tarde' || p === 'noche') return at(hour < 12 ? hour + 12 : hour);
  if (p === 'mañana' || hour > 12 || tomorrow) return at(hour === 12 && p === 'mañana' ? 0 : hour);
  // «a las tres» said at 13:00 is 15:00; «a las 10» said at 9:00 is 10:00.
  const grace = ref - 30 * 60_000;
  const first = [at(hour), at((hour % 12) + 12)].sort((a, b) => a - b).find((t) => t >= grace);
  return first ?? at(hour) + 24 * 3600_000;
}

/** The next meeting `word` names («demo» → «Demo agroactiva»), or any next one for «reunión». */
function meetingNamed(
  word: string,
  meetings: readonly MeetingTime[],
  ref: number,
): MeetingTime | undefined {
  const w = word.toLowerCase();
  const ahead = meetings.filter((m) => m.end > ref).sort((a, b) => a.start - b.start);
  if (w === 'reunión') return ahead[0];
  return ahead.find((m) => m.title.toLowerCase().includes(w));
}

/** The times an ask's words name, read as of `ref` (when it was asked). */
export function timesOf(
  text: string,
  ref: number,
  meetings: readonly MeetingTime[] = [],
): AskTimes {
  const times: AskTimes = {};
  const tomorrow = TOMORROW.test(text);
  const due = DUE.exec(text);
  if (due) times.due = momentOf(due, ref, tomorrow);
  const start = START.exec(text);
  if (start && start.index !== due?.index) times.notBefore = momentOf(start, ref, tomorrow);
  if (times.notBefore === undefined) {
    const after = AFTER_MEETING.exec(text);
    const meeting = after ? meetingNamed(after[1], meetings, ref) : undefined;
    if (meeting) times.notBefore = meeting.end;
    else if (TONIGHT.test(text)) {
      const d = new Date(ref);
      d.setHours(TONIGHT_HOUR, 0, 0, 0);
      if (d.getTime() > ref) times.notBefore = d.getTime();
    }
  }
  return times;
}

/** «14:45» */
export function hourText(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
