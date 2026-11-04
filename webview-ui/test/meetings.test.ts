import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { Meeting } from '../../core/src/messages.ts';
import {
  formatHour,
  meetingBadge,
  meetingDays,
  meetingState,
  nextMeeting,
  readMeetingsMessage,
  SOON_MS,
} from '../src/meetings/meetingsView.ts';

const NOW = new Date(2026, 10, 4, 14, 0).getTime();
const MIN = 60_000;

function meeting(startMin: number, lengthMin = 30, id = `m${startMin}`): Meeting {
  const start = NOW + startMin * MIN;
  return { id, title: id, start, end: start + lengthMin * MIN };
}

describe('meeting state', () => {
  it('is live from its start until its end', () => {
    assert.equal(meetingState(meeting(0), NOW), 'live');
    assert.equal(meetingState(meeting(-10), NOW), 'live');
    assert.equal(meetingBadge(meeting(-10), NOW), 'Ahora');
  });

  it('is about to start inside the window, with the minutes left', () => {
    assert.equal(meetingState(meeting(SOON_MS / MIN), NOW), 'soon');
    assert.equal(meetingBadge(meeting(8), NOW), 'En 8 min');
    // Half a minute left still says a whole one, never "En 0 min".
    assert.equal(meetingBadge(meeting(0.5), NOW), 'En 1 min');
  });

  it('says nothing beside the time for what is not close', () => {
    assert.equal(meetingState(meeting(SOON_MS / MIN + 1), NOW), 'later');
    assert.equal(meetingBadge(meeting(120), NOW), null);
  });
});

describe('meeting days', () => {
  it('groups by local day and leaves out what is over', () => {
    const days = meetingDays(
      [meeting(-60), meeting(30), meeting(60), meeting(24 * 60), meeting(48 * 60)],
      NOW,
    );
    assert.deepEqual(
      days.map((d) => d.meetings.length),
      [2, 1, 1],
    );
    assert.equal(days[0].label, 'Hoy');
    assert.equal(days[1].label, 'Mañana');
    assert.match(days[2].label, /^vie 6 nov$/);
  });

  it('keeps one that began yesterday and is still on under today', () => {
    const days = meetingDays([meeting(-15 * 60, 16 * 60)], NOW);
    assert.equal(days[0].label, 'Hoy');
  });

  it('is empty when nothing is left, which is the empty state', () => {
    assert.deepEqual(meetingDays([], NOW), []);
    assert.deepEqual(meetingDays([meeting(-60)], NOW), []);
    assert.equal(nextMeeting([meeting(-60)], NOW), undefined);
  });

  it('the next one skips what ended while nothing was refreshed', () => {
    assert.equal(nextMeeting([meeting(-60), meeting(10)], NOW)?.id, 'm10');
  });
});

describe('formatHour', () => {
  it('is 24-hour', () => {
    assert.match(formatHour(new Date(2026, 10, 4, 15, 5).getTime()), /^15:05$/);
  });
});

describe('readMeetingsMessage', () => {
  it('takes only its own message', () => {
    assert.equal(readMeetingsMessage({ type: 'usageLimits' }), null);
    assert.equal(readMeetingsMessage({ type: 'upcomingMeetings' }), null);
    const msg = { type: 'upcomingMeetings', connected: false, meetings: [] };
    assert.deepEqual(readMeetingsMessage(msg), msg);
  });
});
