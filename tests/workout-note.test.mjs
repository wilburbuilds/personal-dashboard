import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { parseDayNote, applyCheck, writeCheck, readDayNote, appendInbox, postWebhook, lineHash, notePath } from '../lib/workout-note.mjs';

const NOTE = `---
date: 2026-10-14
session: Day B pull + core
phase: 1
week: 1
---

# Wed

## Warm-up
- [ ] Bike — set 1 — 5 min

## Main
Rest 60–90 sec.
- [ ] One-arm dumbbell row — set 1 — 10 reps
- [x] One-arm dumbbell row — set 2 — 10 reps
- [ ] Plank — set 1 — 30 sec
- [ ] Plank — set 1 — 30 sec
- Not a checkbox — set 9 — leave me

## Notes
Felt fine.
`;

async function vaultWith(md, day = '2026-10-14') {
  const v = await mkdtemp(join(tmpdir(), 'hd-wn-'));
  await mkdir(join(v, 'fitness/workouts'), { recursive: true });
  await writeFile(join(v, 'fitness/workouts', `${day}.md`), md);
  return v;
}

test('parses sections and set lines', () => {
  const p = parseDayNote(NOTE);
  assert.equal(p.fm.session, 'Day B pull + core');
  assert.deepEqual(p.sections.map((s) => s.title), ['Warm-up', 'Main', 'Notes']);
  const main = p.sections[1].items;
  assert.equal(main.length, 4);
  assert.equal(main[0].exercise, 'One-arm dumbbell row');
  assert.equal(main[0].set, 'set 1');
  assert.equal(main[0].target, '10 reps');
  assert.equal(main[1].checked, true);
  assert.deepEqual([main[2].ord, main[3].ord], [0, 1]);
});

test('check flips only that line and leaves every other byte alone', () => {
  const it = parseDayNote(NOTE).sections[1].items[0];
  const { md, changed } = applyCheck(NOTE, { hash: it.hash, ord: 0, checked: true });
  assert.ok(changed);
  const a = NOTE.split('\n'), b = md.split('\n');
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x !== null);
  assert.deepEqual(diff, [it.line]);
  assert.equal(b[it.line], '- [x] One-arm dumbbell row — set 1 — 10 reps');
});

test('uncheck works and repeat is a no-op', () => {
  const it = parseDayNote(NOTE).sections[1].items[1];
  const r = applyCheck(NOTE, { hash: it.hash, ord: 0, checked: false });
  assert.match(r.md, /- \[ \] One-arm dumbbell row — set 2/);
  assert.equal(applyCheck(r.md, { hash: it.hash, checked: false }).changed, false);
});

test('duplicate lines resolve by ordinal', () => {
  const h = lineHash('Plank — set 1 — 30 sec');
  const { md } = applyCheck(NOTE, { hash: h, ord: 1, checked: true });
  const planks = md.split('\n').filter((l) => l.includes('Plank'));
  assert.deepEqual(planks, ['- [ ] Plank — set 1 — 30 sec', '- [x] Plank — set 1 — 30 sec']);
});

test('never adds a checkbox and rejects changed lines', () => {
  assert.throws(() => applyCheck(NOTE, { hash: lineHash('Not a checkbox — set 9 — leave me'), checked: true }), { code: 'conflict' });
  assert.throws(() => applyCheck(NOTE, { hash: lineHash('Gone — set 1'), checked: true }), { code: 'conflict' });
});

test('still lands after Gym inserts lines above (matched by content, not index)', () => {
  const it = parseDayNote(NOTE).sections[1].items[0];
  const edited = NOTE.replace('## Main\n', '## Main\n- [ ] New warmup set — set 1 — 5\n');
  const { md } = applyCheck(edited, { hash: it.hash, checked: true });
  assert.match(md, /- \[x\] One-arm dumbbell row — set 1/);
  assert.match(md, /- \[ \] New warmup set/);
});

test('CRLF notes keep CRLF', () => {
  const crlf = NOTE.replace(/\n/g, '\r\n');
  const it = parseDayNote(crlf).sections[1].items[0];
  const { md } = applyCheck(crlf, { hash: it.hash, checked: true });
  assert.equal(md.replace('[x] One-arm dumbbell row — set 1', '[ ] One-arm dumbbell row — set 1'), crlf);
});

test('writeCheck writes to the file; concurrent writes all land', async () => {
  const v = await vaultWith(NOTE);
  const items = parseDayNote(NOTE).sections[1].items;
  await Promise.all([items[0], items[2], items[3]].map((it) => writeCheck(v, '2026-10-14', { hash: it.hash, ord: it.ord, checked: true })));
  const out = await readFile(join(v, 'fitness/workouts/2026-10-14.md'), 'utf8');
  assert.equal(out.split('\n').filter((l) => l.startsWith('- [x]')).length, 4);
  assert.equal(out.replace(/- \[x\]/g, '- [ ]'), NOTE.replace(/- \[x\]/g, '- [ ]'));
  await rm(v, { recursive: true });
});

test('paths are confined to fitness/workouts/<day>.md', async () => {
  assert.throws(() => notePath('/v', '../training-log'), { code: 'bad-day' });
  assert.throws(() => notePath('/v', '2026-10-14/../../x'), { code: 'bad-day' });
  const v = await vaultWith(NOTE);
  await assert.rejects(writeCheck(v, '2026-10-15', { hash: 'x', checked: true }), { code: 'missing' });
  assert.equal(await readDayNote(v, '2026-10-15'), null);
  await rm(v, { recursive: true });
});

test('on a temporary copy of a real vault note when present', async (t) => {
  const real = join(homedir(), 'vaults/personal/fitness/workouts');
  const v = await mkdtemp(join(tmpdir(), 'hd-wn-real-'));
  await mkdir(join(v, 'fitness/workouts'), { recursive: true });
  let day = null;
  try {
    const { readdir } = await import('node:fs/promises');
    day = (await readdir(real)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().at(-1)?.slice(0, 10) ?? null;
  } catch {}
  if (!day) { t.skip('no real workout notes yet'); return; }
  await cp(join(real, `${day}.md`), join(v, 'fitness/workouts', `${day}.md`));
  const orig = await readFile(join(v, 'fitness/workouts', `${day}.md`), 'utf8');
  const it = parseDayNote(orig).sections.flatMap((s) => s.items)[0];
  if (!it) { t.skip('no set lines'); return; }
  await writeCheck(v, day, { hash: it.hash, ord: it.ord, checked: !it.checked });
  await writeCheck(v, day, { hash: it.hash, ord: it.ord, checked: it.checked });
  assert.equal(await readFile(join(v, 'fitness/workouts', `${day}.md`), 'utf8'), orig);
  await rm(v, { recursive: true });
});

test('gym inbox creates then appends', async () => {
  const v = await mkdtemp(join(tmpdir(), 'hd-inbox-'));
  await appendInbox(v, 'rows felt\n heavy', new Date('2026-10-14T03:00:00Z'));
  await appendInbox(v, 'knee ok', new Date('2026-10-14T03:05:00Z'));
  const out = await readFile(join(v, 'fitness/gym-inbox.md'), 'utf8');
  assert.match(out, /# Gym inbox/);
  assert.match(out, /- 2026-10-14T03:00:00.000Z rows felt heavy\n- 2026-10-14T03:05:00.000Z knee ok\n$/);
  await assert.rejects(appendInbox(v, '   '), { code: 'empty' });
  await rm(v, { recursive: true });
});

test('webhook skipped when unset, posts with bearer when set', async () => {
  assert.deepEqual(await postWebhook({}, {}), { sent: false, skipped: true });
  let seen;
  const r = await postWebhook({ GYM_WEBHOOK_URL: 'https://x.test/h', GYM_WEBHOOK_SECRET: 's3' }, { text: 'hi' }, async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; });
  assert.equal(r.sent, true);
  assert.equal(seen.init.headers.authorization, 'Bearer s3');
  assert.deepEqual(JSON.parse(seen.init.body), { text: 'hi' });
});
