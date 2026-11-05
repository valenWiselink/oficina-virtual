import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { Meeting } from '../../core/src/messages.ts';
import {
  formatHour,
  meetingBadge,
  meetingChip,
  meetingDays,
  meetingKey,
  meetingState,
  meetingToast,
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
  });
});

describe('the chip beside the tabs', () => {
  const join = (m: Meeting): Meeting => ({ ...m, joinUrl: 'https://meet.example/x' });
  const quiet = (m: Meeting): Meeting => ({ ...m, quiet: true });

  it('says nothing with nothing ahead, also if all that is left already ended', () => {
    assert.equal(meetingChip([], NOW), null);
    assert.equal(meetingChip([meeting(-60)], NOW), null);
  });

  it('is calm for what is far, with its time and its day', () => {
    const today = meetingChip([meeting(120)], NOW);
    assert.equal(today?.level, 'calm');
    assert.equal(today?.when, '16:00');
    assert.equal(today?.joinable, false);
    assert.equal(meetingChip([meeting(24 * 60)], NOW)?.when, 'Mañana 14:00');
    assert.match(meetingChip([meeting(48 * 60)], NOW)?.when ?? '', /^vie 6 nov 14:00$/);
  });

  it('counts down from 15 minutes before, with the link at hand', () => {
    const chip = meetingChip([join(meeting(8))], NOW);
    assert.equal(chip?.level, 'soon');
    assert.equal(chip?.when, 'En 8 min');
    assert.equal(chip?.joinable, true);
    assert.equal(meetingChip([meeting(16)], NOW)?.level, 'calm');
  });

  it('is painted while you should be in it, until it ends', () => {
    const chip = meetingChip([join(meeting(-5))], NOW);
    assert.equal(chip?.level, 'now');
    assert.equal(chip?.when, 'Ahora');
    assert.equal(chip?.joinable, true);
    assert.equal(meetingChip([meeting(-30, 30)], NOW), null);
  });

  it('with several at once, the one that started last and the rest counted', () => {
    const chip = meetingChip([meeting(-30, 60, 'a'), meeting(-5, 60, 'b')], NOW);
    assert.equal(chip?.meeting.id, 'b');
    assert.deepEqual(
      chip?.alsoNow.map((m) => m.id),
      ['a'],
    );
  });

  it('two starting at the same time show as one and one more', () => {
    const chip = meetingChip([meeting(5, 30, 'a'), meeting(5, 30, 'b')], NOW);
    assert.equal(chip?.level, 'soon');
    assert.deepEqual(
      chip?.alsoNow.map((m) => m.id),
      ['b'],
    );
  });

  it('being in one does not hide that another is about to start... in the list', () => {
    const chip = meetingChip([meeting(-5, 30, 'a'), meeting(10, 30, 'b')], NOW);
    assert.equal(chip?.meeting.id, 'a');
    assert.equal(chip?.level, 'now');
  });

  it('dismissed, it stops being painted and stays at hand until it ends', () => {
    const m = join(meeting(-5));
    const chip = meetingChip([m, meeting(120)], NOW, (key) => key === meetingKey(m));
    assert.equal(chip?.level, 'calm');
    assert.equal(chip?.meeting.id, m.id);
    assert.equal(chip?.when, 'Ahora');
    assert.equal(chip?.joinable, true);
  });

  it('dismissing one of two leaves the other painted', () => {
    const a = meeting(-30, 60, 'a');
    const b = meeting(-5, 60, 'b');
    const chip = meetingChip([a, b], NOW, (key) => key === meetingKey(b));
    assert.equal(chip?.meeting.id, 'a');
    assert.equal(chip?.level, 'now');
  });

  it('a moved meeting asks again', () => {
    const before = meeting(-5, 30, 'a');
    const moved = meeting(-1, 30, 'a');
    assert.notEqual(meetingKey(before), meetingKey(moved));
  });

  it('a quiet one never paints nor counts down', () => {
    assert.equal(meetingChip([quiet(meeting(-5))], NOW)?.level, 'calm');
    assert.equal(meetingChip([quiet(meeting(-5))], NOW)?.when, 'Ahora');
    assert.equal(meetingChip([quiet(meeting(8))], NOW)?.level, 'calm');
    assert.equal(meetingChip([quiet(meeting(8))], NOW)?.when, 'En 8 min');
  });

  it('a quiet one does not hide what is really next', () => {
    const chip = meetingChip([quiet(meeting(-60, 8 * 60, 'feria')), meeting(120, 30, 'real')], NOW);
    assert.equal(chip?.meeting.id, 'real');
  });
});

describe('the toast', () => {
  const key = (m: Meeting, at: number) => meetingToast(m, at)?.key;

  it('nothing until 5 minutes before', () => {
    assert.equal(meetingToast(meeting(6), NOW), null);
    assert.match(key(meeting(5), NOW) ?? '', /:antes$/);
    assert.equal(meetingToast(meeting(4.5), NOW)?.title, 'En 5 min');
  });

  it('once more at the start, not half an hour late', () => {
    assert.match(key(meeting(-1), NOW) ?? '', /:ahora$/);
    assert.equal(meetingToast(meeting(-11, 60), NOW), null);
  });

  it('never for a quiet one or one that ended', () => {
    assert.equal(meetingToast({ ...meeting(2), quiet: true }, NOW), null);
    assert.equal(meetingToast(meeting(-5, 2), NOW), null);
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
