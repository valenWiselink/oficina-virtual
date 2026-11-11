/**
 * When a pending ask is for, read from its own words. The reading lives in
 * core (askTime.ts): the office uses it too, for Jarvis's «cuando».
 */
export {
  type AskTimes,
  hourText,
  meetingNamed,
  type MeetingTime,
  MORNING_HOUR,
  timesOf,
  whenText,
} from '../../../core/src/askTime.js';
