import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractHeadlinesSection,
  parseHeadlinesSection,
  buildCuratedHeadlinesSource,
  buildHeadlinesCurationRecord,
  isFreshHeadlinesCuration,
  applyHeadlinesCuration,
  readMorningBriefHeadlines,
  pacificDayKey,
  morningBriefPath,
  HEADLINES_CURATION_LIMIT,
} from '../lib/headlines-curate.mjs';

const morning = new Date('2026-09-30T15:30:00Z'); // 08:30 PT
const day = '2026-09-30';

const sampleBrief = `# Morning brief · ${day}

## Overview
Stuff about the day.

## Headlines

- [Markets rally on Fed pause](https://www.cnbc.com/markets-rally) — S&P futures up overnight
- [AI chip race heats up](https://techcrunch.com/ai-chips)
- [World leaders meet](https://www.bbc.com/news/world) – big-picture summit
* [Politics watch](https://www.npr.org/politics) - midterm framing
- [Dup title](https://www.cnbc.com/markets-rally?ref=1)
- [Bad](javascript:alert(1))
- [Seventh should drop](https://example.com/7)
- [Eighth](https://example.com/8)

## Notes
Ignore me.
`;

test('extractHeadlinesSection stops at next ## heading', () => {
  const body = extractHeadlinesSection(sampleBrief);
  assert.match(body, /Markets rally/);
  assert.doesNotMatch(body, /## Notes/);
  assert.equal(extractHeadlinesSection('# No section\n'), '');
});

test('parseHeadlinesSection accepts dashes, caps at 6, drops bad/dupes', () => {
  const items = parseHeadlinesSection(sampleBrief);
  // 4 unique good + seventh + eighth after skipping dup URL and javascript: → 6 (limit)
  assert.equal(items.length, 6);
  assert.equal(items[0].title, 'Markets rally on Fed pause');
  assert.equal(items[0].detail, 'S&P futures up overnight');
  assert.equal(items[1].title, 'AI chip race heats up');
  assert.equal(items[1].detail, undefined);
  assert.equal(items[2].detail, 'big-picture summit');
  assert.equal(items[3].detail, 'midterm framing');
  assert.equal(items[4].title, 'Seventh should drop');
  assert.equal(items[5].title, 'Eighth');
  assert.ok(items.every((i) => /^https?:\/\//.test(i.url)));
  assert.ok(items.length <= HEADLINES_CURATION_LIMIT);
});

test('fresh vault/PUT replace RSS; stale or empty leave floor', async () => {
  const raw = {
    status: 'ready',
    updatedAt: morning.toISOString(),
    note: 'Selected topic feeds',
    items: [{ title: 'RSS story', url: 'https://example.com/rss', label: 'Tech · BBC' }],
  };

  const root = await mkdtemp(join(tmpdir(), 'pd-headlines-'));
  try {
    const dir = join(root, 'briefs', 'morning');
    await mkdir(dir, { recursive: true });
    await writeFile(
      morningBriefPath(day, root),
      `## Headlines\n\n- [Vault pick](https://example.com/vault) — from brief\n`,
      'utf8',
    );
    const vault = await readMorningBriefHeadlines(morning, { root });
    assert.ok(vault);
    assert.equal(vault.day, day);
    assert.equal(vault.items.length, 1);

    const merged = applyHeadlinesCuration(raw, { vault }, morning);
    assert.equal(merged.items.length, 1);
    assert.equal(merged.items[0].title, 'Vault pick');
    assert.match(merged.note, /curated/i);

    // Stale PUT record ignored when no vault
    const staleRecord = buildHeadlinesCurationRecord({
      source: buildCuratedHeadlinesSource(
        [{ title: 'Old', url: 'https://example.com/old' }],
        morning,
        { mode: 'external' },
      ),
      now: morning,
      mode: 'external',
      options: { date: '2026-09-01' },
    });
    assert.equal(isFreshHeadlinesCuration(staleRecord, morning), false);
    const floor = applyHeadlinesCuration(raw, { record: staleRecord }, morning);
    assert.equal(floor.items[0].title, 'RSS story');

    // Fresh PUT replaces when vault missing
    const freshRecord = buildHeadlinesCurationRecord({
      source: buildCuratedHeadlinesSource(
        [{ title: 'API pick', url: 'https://example.com/api', detail: 'via PUT' }],
        morning,
        { mode: 'external' },
      ),
      now: morning,
      mode: 'external',
    });
    assert.equal(freshRecord.date, pacificDayKey(morning));
    assert.equal(isFreshHeadlinesCuration(freshRecord, morning), true);
    const fromPut = applyHeadlinesCuration(raw, { record: freshRecord }, morning);
    assert.equal(fromPut.items[0].title, 'API pick');

    // Vault wins over PUT
    const preferVault = applyHeadlinesCuration(
      raw,
      { vault, record: freshRecord },
      morning,
    );
    assert.equal(preferVault.items[0].title, 'Vault pick');

    // Empty headlines section → null vault → RSS floor
    await writeFile(morningBriefPath(day, root), `## Headlines\n\n(none today)\n`, 'utf8');
    const emptyVault = await readMorningBriefHeadlines(morning, { root });
    assert.equal(emptyVault, null);
    const emptyMerged = applyHeadlinesCuration(raw, { vault: emptyVault }, morning);
    assert.equal(emptyMerged.items[0].title, 'RSS story');

    // Fresh record with zero items is not fresh
    const zero = buildHeadlinesCurationRecord({
      source: buildCuratedHeadlinesSource([], morning, { mode: 'external' }),
      now: morning,
    });
    assert.equal(isFreshHeadlinesCuration(zero, morning), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
