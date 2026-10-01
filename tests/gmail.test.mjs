import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overnightBounds,
  overnightSource,
  followupsSource,
  isNeedsYou,
  readGmailSources,
} from '../lib/gmail.mjs';
import { zonedCivilTime } from '../lib/calendar.mjs';

// Fixed Pacific morning: 2026-09-30 08:30 PT = 15:30Z (PDT, UTC-7)
const morning = new Date('2026-09-30T15:30:00Z');
// 21:00 PT Sep 30 = 04:00Z Oct 1
const beforeOvernight = new Date('2026-10-01T04:00:00Z');
// 23:00 PT Sep 30 = 06:00Z Oct 1
const duringLate = new Date('2026-10-01T06:00:00Z');
// 03:00 PT Sep 30 = 10:00Z Sep 30
const duringEarly = new Date('2026-09-30T10:00:00Z');

function msg({ id, subject, from, internalDate, labelIds, snippet, threadId }) {
  return {
    id,
    threadId: threadId || id,
    internalDate: String(internalDate),
    labelIds,
    snippet,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
      ],
    },
  };
}

test('overnightBounds: daytime uses prior 10pm–8am Pacific', () => {
  const { start, end } = overnightBounds(morning);
  assert.equal(start.toISOString(), zonedCivilTime('2026-09-29', '22:00:00').toISOString());
  assert.equal(end.toISOString(), zonedCivilTime('2026-09-30', '08:00:00').toISOString());
});

test('overnightBounds: before 10pm still uses last overnight', () => {
  const { start, end } = overnightBounds(beforeOvernight);
  assert.equal(start.toISOString(), zonedCivilTime('2026-09-29', '22:00:00').toISOString());
  assert.equal(end.toISOString(), zonedCivilTime('2026-09-30', '08:00:00').toISOString());
});

test('overnightBounds: after 10pm opens tonight window clamped to now', () => {
  const { start, end } = overnightBounds(duringLate);
  assert.equal(start.toISOString(), zonedCivilTime('2026-09-30', '22:00:00').toISOString());
  assert.equal(end.toISOString(), duringLate.toISOString());
});

test('overnightBounds: early morning ongoing overnight clamped to now', () => {
  const { start, end } = overnightBounds(duringEarly);
  assert.equal(start.toISOString(), zonedCivilTime('2026-09-29', '22:00:00').toISOString());
  assert.equal(end.toISOString(), duringEarly.toISOString());
});

test('overnightSource keeps only messages inside the overnight window', () => {
  const messages = [
    msg({
      id: 'in',
      subject: 'Late ping',
      from: 'Ada <ada@example.com>',
      internalDate: zonedCivilTime('2026-09-29', '23:30:00').getTime(),
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'Can you look?',
    }),
    msg({
      id: 'out-early',
      subject: 'Afternoon',
      from: 'Bob <bob@example.com>',
      internalDate: zonedCivilTime('2026-09-29', '15:00:00').getTime(),
      labelIds: ['INBOX'],
      snippet: 'Too early',
    }),
    msg({
      id: 'out-late',
      subject: 'After eight',
      from: 'Cara <cara@example.com>',
      internalDate: zonedCivilTime('2026-09-30', '09:00:00').getTime(),
      labelIds: ['INBOX'],
      snippet: 'Too late',
    }),
  ];
  const s = overnightSource(messages, morning, { fetchedAt: morning.toISOString() });
  assert.equal(s.status, 'ready');
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].title, 'Late ping');
  assert.match(s.items[0].detail, /Ada/);
  assert.match(s.items[0].detail, /Can you look/);
  assert.equal(s.items[0].url, 'https://mail.google.com/mail/u/0/#inbox/in');
  assert.match(s.note, /overnight/i);
});

test('followupsSource ranks unread/important/starred and drops spam', () => {
  const base = zonedCivilTime('2026-09-29', '12:00:00').getTime();
  const messages = [
    msg({
      id: 'spam',
      subject: 'Spam',
      from: 'x@x.com',
      internalDate: base,
      labelIds: ['UNREAD', 'SPAM'],
    }),
    msg({
      id: 'star',
      subject: 'Starred note',
      from: '"Sam" <sam@example.com>',
      internalDate: base + 1000,
      labelIds: ['INBOX', 'STARRED'],
      snippet: 'Later',
    }),
    msg({
      id: 'ui',
      subject: 'Urgent unread',
      from: 'Pat <pat@example.com>',
      internalDate: base,
      labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
      snippet: 'Please reply',
    }),
    msg({
      id: 'read-ok',
      subject: 'Plain read',
      from: 'n@n.com',
      internalDate: base + 2000,
      labelIds: ['INBOX'],
    }),
  ];
  assert.equal(isNeedsYou(messages[0]), false);
  assert.equal(isNeedsYou(messages[3]), false);
  const s = followupsSource(messages, morning);
  assert.equal(s.status, 'ready');
  assert.equal(s.items.length, 2);
  assert.equal(s.items[0].title, 'Urgent unread');
  assert.equal(s.items[0].label, 'Unread · Important');
  assert.equal(s.items[1].title, 'Starred note');
  assert.equal(s.items[1].detail.startsWith('Sam'), true);
});

test('empty overnight stays ready with a clear note', () => {
  const s = overnightSource([], morning);
  assert.equal(s.status, 'ready');
  assert.equal(s.items.length, 0);
  assert.match(s.note, /No overnight mail/);
});

test('readGmailSources is unconnected without local oauth secrets', async () => {
  const prevO = process.env.DASHBOARD_GOOGLE_OAUTH;
  const prevT = process.env.DASHBOARD_GOOGLE_TOKENS;
  process.env.DASHBOARD_GOOGLE_OAUTH = '/tmp/personal-dashboard-missing-oauth.json';
  process.env.DASHBOARD_GOOGLE_TOKENS = '/tmp/personal-dashboard-missing-tokens.json';
  try {
    const { overnight, followups } = await readGmailSources(morning);
    assert.equal(overnight.status, 'unconnected');
    assert.equal(followups.status, 'unconnected');
    assert.match(overnight.note, /your personal Google account/);
  } finally {
    if (prevO === undefined) delete process.env.DASHBOARD_GOOGLE_OAUTH;
    else process.env.DASHBOARD_GOOGLE_OAUTH = prevO;
    if (prevT === undefined) delete process.env.DASHBOARD_GOOGLE_TOKENS;
    else process.env.DASHBOARD_GOOGLE_TOKENS = prevT;
  }
});
