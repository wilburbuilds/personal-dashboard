import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedCivilTime } from '../lib/calendar.mjs';
import {
  isObviousNoise,
  importanceScore,
  heuristicSelect,
  overnightCandidateMessages,
  applyOvernightCuration,
  isFreshCuration,
  buildCuratedSource,
  buildCurationRecord,
  curationDayKey,
  selectByIds,
  candidatesForLlm,
  curateOvernightMessages,
  CURATION_LIMIT,
} from '../lib/overnight-curate.mjs';

const morning = new Date('2026-09-30T15:30:00Z'); // 08:30 PT

function msg({ id, subject, from, internalDate, labelIds, snippet, listUnsub }) {
  const headers = [
    { name: 'Subject', value: subject },
    { name: 'From', value: from },
  ];
  if (listUnsub) headers.push({ name: 'List-Unsubscribe', value: listUnsub });
  return {
    id,
    threadId: id,
    internalDate: String(internalDate),
    labelIds,
    snippet,
    payload: { headers },
  };
}

const overnightMs = zonedCivilTime('2026-09-29', '23:30:00').getTime();

test('isObviousNoise drops promotions and promo subjects', () => {
  assert.equal(
    isObviousNoise(
      msg({
        id: '1',
        subject: '40% off flash sale',
        from: 'Shop <deals@store.com>',
        internalDate: overnightMs,
        labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'],
      }),
    ),
    true,
  );
  assert.equal(
    isObviousNoise(
      msg({
        id: '2',
        subject: 'Your weekly digest',
        from: 'newsletter@news.com',
        internalDate: overnightMs,
        labelIds: ['INBOX', 'CATEGORY_UPDATES'],
        listUnsub: '<mailto:unsub@news.com>',
      }),
    ),
    true,
  );
});

test('security and money override bulk-from noise', () => {
  const security = msg({
    id: 's',
    subject: 'Security alert: new sign-in',
    from: 'noreply@accounts.google.com',
    internalDate: overnightMs,
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Unusual activity on your account',
  });
  assert.equal(isObviousNoise(security), false);
  assert.ok(importanceScore(security) >= 40);

  const money = msg({
    id: 'm',
    subject: 'Invoice payment due',
    from: 'billing@vendor.com',
    internalDate: overnightMs,
    labelIds: ['INBOX', 'UNREAD'],
  });
  assert.equal(isObviousNoise(money), false);
  assert.ok(importanceScore(money) >= 30);
});

test('heuristicSelect caps and ranks keepers', () => {
  const messages = [
    msg({
      id: 'promo',
      subject: 'Flash sale',
      from: 'x@y.com',
      internalDate: overnightMs,
      labelIds: ['INBOX', 'CATEGORY_PROMOTIONS', 'UNREAD'],
    }),
    msg({
      id: 'star',
      subject: 'Family note',
      from: 'Sam <sam@example.com>',
      internalDate: overnightMs + 1,
      labelIds: ['INBOX', 'STARRED'],
      snippet: 'Call me tomorrow',
    }),
    msg({
      id: 'sec',
      subject: 'Password reset verification',
      from: 'noreply@bank.com',
      internalDate: overnightMs + 2,
      labelIds: ['INBOX', 'UNREAD'],
    }),
    msg({
      id: 'meh',
      subject: 'FYI',
      from: 'n@n.com',
      internalDate: overnightMs + 3,
      labelIds: ['INBOX'],
    }),
  ];
  const selected = heuristicSelect(messages, { limit: CURATION_LIMIT });
  const ids = selected.map((s) => s.message.id);
  assert.ok(ids.includes('sec'));
  assert.ok(ids.includes('star'));
  assert.ok(!ids.includes('promo'));
  assert.ok(selected.length <= CURATION_LIMIT);
});

test('overnightCandidateMessages respects window', () => {
  const messages = [
    msg({
      id: 'in',
      subject: 'Late',
      from: 'a@a.com',
      internalDate: overnightMs,
      labelIds: ['INBOX'],
    }),
    msg({
      id: 'out',
      subject: 'Afternoon',
      from: 'b@b.com',
      internalDate: zonedCivilTime('2026-09-29', '15:00:00').getTime(),
      labelIds: ['INBOX'],
    }),
  ];
  const c = overnightCandidateMessages(messages, morning);
  assert.equal(c.length, 1);
  assert.equal(c[0].id, 'in');
});

test('fresh curation replaces raw overnight; stale leaves floor', () => {
  const raw = {
    status: 'ready',
    updatedAt: morning.toISOString(),
    note: 'Gmail overnight · noisy',
    items: [{ title: 'Newsletter blast' }, { title: 'Another promo' }],
  };
  const curatedSource = buildCuratedSource(
    [
      {
        message: msg({
          id: 'sec',
          subject: 'Security alert',
          from: 'noreply@x.com',
          internalDate: overnightMs,
          labelIds: ['INBOX'],
        }),
        reason: 'Security',
      },
    ],
    morning,
    { candidateCount: 5, mode: 'heuristic' },
  );
  const record = buildCurationRecord({
    source: curatedSource,
    now: morning,
    mode: 'heuristic',
    candidateCount: 5,
  });
  assert.equal(record.date, curationDayKey(morning));
  assert.equal(isFreshCuration(record, morning), true);

  const merged = applyOvernightCuration(raw, record, morning);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].title, 'Security alert');
  assert.match(merged.note, /curated/i);

  const stale = { ...record, date: '2026-09-01' };
  assert.equal(isFreshCuration(stale, morning), false);
  const floor = applyOvernightCuration(raw, stale, morning);
  assert.equal(floor.items.length, 2);
  assert.equal(floor.note, raw.note);
});

test('empty curation still replaces with none-important note when fresh', () => {
  const raw = {
    status: 'ready',
    updatedAt: morning.toISOString(),
    note: 'raw',
    items: [{ title: 'Noise' }],
  };
  const source = buildCuratedSource([], morning, { candidateCount: 4, mode: 'heuristic' });
  const record = buildCurationRecord({ source, now: morning, candidateCount: 4, keptCount: 0 });
  const merged = applyOvernightCuration(raw, record, morning);
  assert.equal(merged.items.length, 0);
  assert.match(merged.note, /Nothing important overnight/i);
});

test('selectByIds and candidatesForLlm stay id-stable', () => {
  const messages = [
    msg({
      id: 'a',
      subject: 'Hi',
      from: 'Ada <ada@example.com>',
      internalDate: overnightMs,
      labelIds: ['INBOX', 'IMPORTANT'],
    }),
  ];
  const llm = candidatesForLlm(messages);
  assert.equal(llm[0].id, 'a');
  const picked = selectByIds(messages, [{ id: 'a', reason: 'Personal', priority: 1 }, { id: 'missing' }]);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].reason, 'Personal');
});

test('curateOvernightMessages heuristic-only without grok', async () => {
  const messages = [
    msg({
      id: 'promo',
      subject: 'Weekly newsletter',
      from: 'newsletter@x.com',
      internalDate: overnightMs,
      labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'],
    }),
    msg({
      id: 'keep',
      subject: 'Action required: confirm within 24h',
      from: 'Pat <pat@example.com>',
      internalDate: overnightMs + 10,
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
    }),
  ];
  const { record, mode, source } = await curateOvernightMessages(messages, morning, {
    useGrok: false,
  });
  assert.equal(mode, 'heuristic');
  assert.equal(record.date, '2026-09-30');
  assert.ok(source.items.some((i) => i.title.includes('Action required')));
  assert.ok(!source.items.some((i) => /newsletter/i.test(i.title)));
});
