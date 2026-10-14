import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarSource, pacificDayBounds, zonedCivilTime, readCalendarSource } from '../lib/calendar.mjs';

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);

// Fixed Pacific morning: 2026-09-30 08:00 PT = 15:00Z (PDT, UTC-7)
const now = new Date('2026-09-30T15:00:00Z');

test('pacific day bounds land on civil midnight Pacific', () => {
  const { day, timeMin, timeMax } = pacificDayBounds(now);
  assert.equal(day, '2026-09-30');
  assert.equal(zonedCivilTime('2026-09-30', '00:00:00').toISOString(), timeMin.toISOString());
  assert.equal(dayKey(timeMax), '2026-10-01');
});

test('maps timed and all-day events inside the morning-brief horizon', () => {
  const events = [
    {
      status: 'confirmed',
      summary: 'Standup',
      start: { dateTime: '2026-09-30T09:00:00-07:00' },
      end: { dateTime: '2026-09-30T09:30:00-07:00' },
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      location: 'Zoom',
    },
    {
      status: 'confirmed',
      summary: 'Birthday',
      start: { date: '2026-09-30' },
      end: { date: '2026-10-01' },
    },
    {
      status: 'confirmed',
      summary: 'Tomorrow early',
      start: { dateTime: '2026-10-01T07:00:00-07:00' },
      end: { dateTime: '2026-10-01T08:00:00-07:00' },
    },
    {
      status: 'cancelled',
      summary: 'Cancelled',
      start: { dateTime: '2026-09-30T17:00:00-07:00' },
      end: { dateTime: '2026-09-30T18:00:00-07:00' },
    },
    {
      status: 'confirmed',
      summary: 'Already done',
      start: { dateTime: '2026-09-30T07:00:00-07:00' },
      end: { dateTime: '2026-09-30T07:45:00-07:00' },
    },
    {
      status: 'confirmed',
      summary: 'Late tonight beyond 12h',
      start: { dateTime: '2026-09-30T21:30:00-07:00' },
      end: { dateTime: '2026-09-30T22:00:00-07:00' },
    },
  ];
  const s = calendarSource(events, now, { fetchedAt: now.toISOString() });
  assert.equal(s.status, 'ready');
  assert.equal(s.items.length, 2);
  assert.equal(s.items[0].title, 'Birthday');
  assert.equal(s.items[0].time, 'All day');
  assert.equal(s.items[1].title, 'Standup');
  assert.match(s.items[1].time, /9:00\s*AM/);
  assert.equal(s.items[1].detail, 'Zoom');
  assert.equal(s.items[1].url, 'https://calendar.google.com/event?eid=abc');
});

test('empty day stays ready with a clear note', () => {
  const s = calendarSource([], now);
  assert.equal(s.status, 'ready');
  assert.equal(s.items.length, 0);
  assert.match(s.note, /Nothing on the calendar/);
});

test('rejects javascript: urls', () => {
  const s = calendarSource(
    [
      {
        status: 'confirmed',
        summary: 'Bad link',
        start: { dateTime: '2026-09-30T16:00:00-07:00' },
        end: { dateTime: '2026-09-30T17:00:00-07:00' },
        htmlLink: 'javascript:alert(1)',
      },
    ],
    now,
  );
  assert.equal(s.items[0].url, undefined);
});

test('readCalendarSource is unconnected without local oauth secrets', async () => {
  const prevO = process.env.DASHBOARD_GOOGLE_OAUTH;
  const prevT = process.env.DASHBOARD_GOOGLE_TOKENS;
  process.env.DASHBOARD_GOOGLE_OAUTH = '/tmp/personal-dashboard-missing-oauth.json';
  process.env.DASHBOARD_GOOGLE_TOKENS = '/tmp/personal-dashboard-missing-tokens.json';
  try {
    const s = await readCalendarSource(now);
    assert.equal(s.status, 'unconnected');
    assert.equal(s.items.length, 0);
    assert.match(s.note, /personal Google account/);
  } finally {
    if (prevO === undefined) delete process.env.DASHBOARD_GOOGLE_OAUTH;
    else process.env.DASHBOARD_GOOGLE_OAUTH = prevO;
    if (prevT === undefined) delete process.env.DASHBOARD_GOOGLE_TOKENS;
    else process.env.DASHBOARD_GOOGLE_TOKENS = prevT;
  }
});
