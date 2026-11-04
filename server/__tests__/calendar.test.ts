import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpcomingMeetings } from '../../core/src/messages.js';
import {
  type CalendarAnswer,
  calendarArgs,
  calendarSettings,
  CalendarStream,
  guardSource,
} from '../src/calendar/calendarQuery.js';
import {
  CALENDAR_POLL_MS,
  CALENDAR_STALE_MS,
  CalendarWatch,
} from '../src/calendar/calendarWatch.js';
import { toMeetings, UNTITLED_MEETING } from '../src/calendar/meetings.js';
import { PRIVILEGED_ONLY_BROADCASTS } from '../src/httpServer.js';

const NOW = Date.parse('2026-11-04T17:00:00Z');
const HOUR = 3_600_000;

function event(fields: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    status: 'confirmed',
    summary: 'Daily',
    eventType: 'DEFAULT',
    start: { dateTime: new Date(NOW + HOUR).toISOString() },
    end: { dateTime: new Date(NOW + 2 * HOUR).toISOString() },
    ...fields,
  };
}

describe('toMeetings', () => {
  it('sends the page only what the panel shows', () => {
    const [meeting] = toMeetings(
      [
        event({
          description: 'secreto',
          attendees: [{ email: 'alguien@ejemplo.com', responseStatus: 'accepted' }],
          conferenceUrl: 'https://meet.google.com/abc-defg-hij',
        }),
      ],
      NOW,
    );
    expect(meeting).toEqual({
      id: 'e1',
      title: 'Daily',
      start: NOW + HOUR,
      end: NOW + 2 * HOUR,
      joinUrl: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('drops what is not a meeting of yours', () => {
    const gone = [
      event({ status: 'cancelled' }),
      event({ eventType: 'FOCUS_TIME' }),
      event({ eventType: 'OUT_OF_OFFICE' }),
      event({ eventType: 'WORKING_LOCATION' }),
      event({ start: { date: '2026-11-05' }, end: { date: '2026-11-06' } }),
      event({ attendees: [{ self: true, responseStatus: 'declined' }] }),
      event({ end: { dateTime: new Date(NOW - 1).toISOString() } }),
    ];
    expect(toMeetings(gone, NOW)).toEqual([]);
  });

  it('keeps one in progress and one you were not asked to answer', () => {
    const live = event({
      start: { dateTime: new Date(NOW - HOUR).toISOString() },
      end: { dateTime: new Date(NOW + HOUR).toISOString() },
      attendees: [{ email: 'otro@ejemplo.com', responseStatus: 'declined' }],
    });
    expect(toMeetings([live], NOW)).toHaveLength(1);
  });

  it('opens only https links, wherever they come from', () => {
    const join = (fields: Record<string, unknown>) => toMeetings([event(fields)], NOW)[0].joinUrl;
    expect(join({ conferenceUrl: 'javascript:alert(1)' })).toBeUndefined();
    expect(join({ conferenceUrl: 'http://meet.example.com/x' })).toBeUndefined();
    expect(join({ location: 'Sala 3, segundo piso' })).toBeUndefined();
    expect(join({ location: 'https://zoom.us/j/123' })).toBe('https://zoom.us/j/123');
    expect(
      join({ conferenceData: { videoEntryPoint: { uri: 'https://teams.example.com/l/1' } } }),
    ).toBe('https://teams.example.com/l/1');
  });

  it('names one without a title, sorts and bounds the list', () => {
    const later = event({
      id: 'later',
      start: { dateTime: new Date(NOW + 3 * HOUR).toISOString() },
    });
    const list = toMeetings([later, event({ summary: '   ' })], NOW);
    expect(list.map((m) => m.title)).toEqual([UNTITLED_MEETING, 'Daily']);
    expect(
      toMeetings(
        Array.from({ length: 40 }, () => event()),
        NOW,
      ).length,
    ).toBe(15);
    expect(toMeetings('no es una lista', NOW)).toEqual([]);
  });
});

const line = (o: unknown) => JSON.stringify(o);
const hook = (output: string, outcome = 'success') =>
  line({ type: 'system', subtype: 'hook_response', output, outcome });
const init = (status?: string) =>
  line({
    type: 'system',
    subtype: 'init',
    mcp_servers: status ? [{ name: 'claude.ai Google Calendar', status }] : [],
  });
const GUARD = JSON.stringify({ decision: 'block', reason: 'oficina-calendario' });

describe('CalendarStream', () => {
  it('releases the guard on the answer of the connector, not on its own', () => {
    const stream = new CalendarStream();
    expect(stream.push(hook(GUARD))).toBe(false);
    expect(stream.push(hook('', 'cancelled'))).toBe(false);
    expect(stream.push(hook(JSON.stringify({ events: [] })))).toBe(true);
    expect(stream.answer()).toEqual({ kind: 'events', events: [], modelUsed: false });
  });

  it('releases it too when the connector failed, to end the run', () => {
    const stream = new CalendarStream();
    expect(stream.push(hook('MCP server not connected', 'error'))).toBe(true);
    stream.push(init('pending'));
    expect(stream.answer().kind).toBe('retry');
  });

  it.each([
    ['needs-auth', init('needs-auth')],
    ['failed', init('failed')],
    ['not listed', init()],
    ['no session at all', 'no es json'],
  ])('reads the connector as off: %s', (_name, first) => {
    const stream = new CalendarStream();
    stream.push(first);
    expect(stream.answer().kind).toBe('off');
  });

  it('says it when a run reached the model', () => {
    const stream = new CalendarStream();
    stream.push(line({ type: 'result', total_cost_usd: 0, num_turns: 0 }));
    expect(stream.answer().modelUsed).toBe(false);
    stream.push(line({ type: 'result', total_cost_usd: 0.0001, num_turns: 1 }));
    expect(stream.answer().modelUsed).toBe(true);
  });

  it('a reply that is not the expected JSON is a failed attempt', () => {
    const stream = new CalendarStream();
    stream.push(init('connected'));
    stream.push(hook('{"otra":"cosa"}'));
    expect(stream.answer().kind).toBe('retry');
  });
});

describe('what a read runs', () => {
  it('only reads, and blocks if anything times out', () => {
    const settings = calendarSettings('guard.cjs', NOW) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<Record<string, unknown>> }> };
    };
    const hooks = settings.hooks.UserPromptSubmit[0].hooks;
    const tools = hooks.filter((h) => h.type === 'mcp_tool').map((h) => h.tool);
    expect(tools).toEqual(['list_events']);
    expect(hooks.every((h) => h.onFailure === 'block')).toBe(true);
  });

  it('runs no tools, keeps no session and ignores the user settings', () => {
    const args = calendarArgs('settings.json');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--no-session-persistence');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('local');
  });

  it('the guard blocks as soon as its file appears', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
    const settings = calendarSettings(path.join(dir, 'guard.cjs'), NOW);
    expect(settings).toBeTruthy();
    fs.writeFileSync(path.join(dir, 'guard.cjs'), guardSource());
    const child = spawn(process.execPath, [path.join(dir, 'guard.cjs')]);
    let out = '';
    child.stdout.on('data', (d) => (out += String(d)));
    const closed = new Promise((resolve) => child.on('close', resolve));
    fs.writeFileSync(path.join(dir, 'listo'), '');
    await closed;
    expect(out.trim()).toBe(GUARD);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('CalendarWatch', () => {
  let sent: UpcomingMeetings[];
  let answers: CalendarAnswer[];
  let queries: number;
  let clock: number;
  const events = (...list: unknown[]): CalendarAnswer => ({
    kind: 'events',
    events: list,
    modelUsed: false,
  });
  const off: CalendarAnswer = { kind: 'off', modelUsed: false };
  const retry: CalendarAnswer = { kind: 'retry', modelUsed: false };

  const watch = () =>
    new CalendarWatch({
      broadcast: (m) => sent.push(m),
      now: () => clock,
      query: () => {
        queries += 1;
        return Promise.resolve(answers.shift() ?? events());
      },
    });

  beforeEach(() => {
    sent = [];
    answers = [];
    queries = 0;
    clock = NOW;
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('without the connector stays silent: no panel, nothing sent', async () => {
    const w = watch();
    answers = [off, off, off];
    await w.poll();
    await w.poll();
    await w.poll();
    expect(sent).toEqual([]);
    expect(w.message().connected).toBe(false);
  });

  it('with the connector and no meetings there is a panel, empty', async () => {
    const w = watch();
    await w.poll();
    expect(sent).toEqual([{ type: 'upcomingMeetings', connected: true, meetings: [] }]);
  });

  it('sends only what changed', async () => {
    const w = watch();
    answers = [events(event()), events(event()), events(event({ summary: 'Otra' }))];
    await w.poll();
    await w.poll();
    expect(sent).toHaveLength(1);
    await w.poll();
    expect(sent).toHaveLength(2);
  });

  it('a blip keeps what is on screen; a disconnected connector hides it', async () => {
    const w = watch();
    answers = [events(event()), retry, off, off];
    await w.poll();
    await w.poll();
    await w.poll();
    expect(w.message().connected).toBe(true);
    await w.poll();
    expect(w.message()).toEqual({ type: 'upcomingMeetings', connected: false, meetings: [] });
  });

  it('failing for too long hides meetings it can no longer vouch for', async () => {
    const w = watch();
    answers = [events(event()), retry];
    await w.poll();
    clock += CALENDAR_STALE_MS + 1;
    await w.poll();
    expect(w.message().connected).toBe(false);
  });

  it('polls only while a tokened page is open, and refreshes by itself', async () => {
    const w = watch();
    await vi.advanceTimersByTimeAsync(CALENDAR_POLL_MS * 3);
    expect(queries).toBe(0);

    w.clientJoined();
    await vi.advanceTimersByTimeAsync(0);
    expect(queries).toBe(1);
    await vi.advanceTimersByTimeAsync(CALENDAR_POLL_MS);
    expect(queries).toBe(2);

    w.clientJoined();
    w.clientLeft();
    await vi.advanceTimersByTimeAsync(CALENDAR_POLL_MS);
    expect(queries).toBe(3);

    w.clientLeft();
    await vi.advanceTimersByTimeAsync(CALENDAR_POLL_MS * 3);
    expect(queries).toBe(3);
    w.stop();
  });

  it('a reload does not read again before it is due', async () => {
    const w = watch();
    clock = NOW;
    w.clientJoined();
    await vi.advanceTimersByTimeAsync(0);
    w.clientLeft();
    w.clientJoined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queries).toBe(1);
    w.stop();
  });

  it('stops for good when a read ever reaches the model', async () => {
    const w = watch();
    answers = [{ ...events(), modelUsed: true }];
    w.clientJoined();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CALENDAR_POLL_MS * 3);
    expect(queries).toBe(1);
    expect(console.warn).toHaveBeenCalledOnce();
    w.stop();
  });

  it('a query that throws is only a failed attempt', async () => {
    const w = new CalendarWatch({
      broadcast: (m) => sent.push(m),
      query: () => Promise.reject(new Error('boom')),
    });
    await expect(w.poll()).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('logs nothing of the calendar', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const w = watch();
    answers = [events(event({ summary: 'Reunión secreta' })), retry, off, off];
    for (let i = 0; i < 4; i++) await w.poll();
    expect(log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('who gets the meetings', () => {
  it('never a read-only client', () => {
    expect(PRIVILEGED_ONLY_BROADCASTS.has('upcomingMeetings')).toBe(true);
  });
});
