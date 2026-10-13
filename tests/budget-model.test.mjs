import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetView } from '../lib/budget/model.mjs';
import { homeConfig } from '../lib/home-config.mjs';

const cfg = { ...homeConfig.budget, actualURL: 'https://actual.example' };
const tx = (date, amount, category, account = 'Checking') => ({ date, amount, category, account, payee: 'x' });
const cache = {
  fetchedAt: '2026-10-13T20:00:00Z', budgetName: 'Test',
  budgets: {},
  accounts: [
    { name: 'Checking', balance: 300000, balance30: 250000, closed: false },
    { name: 'Rewards Visa', balance: -150000, balance30: -100000, closed: false },
  ],
  transactions: [
    tx('2026-09-01', -30000, 'Dining'), tx('2026-09-02', -60000, 'Groceries'), tx('2026-09-20', -100000, 'Housing'),
    tx('2026-09-28', -5000, 'Interest & fees', 'Rewards Visa'), tx('2026-09-15', 400000, 'Paycheck'),
    tx('2026-10-02', -25000, 'Dining'), tx('2026-10-09', -10000, 'Groceries'), tx('2026-10-12', -1000, 'Dining'),
  ],
};
const now = new Date('2026-10-13T19:00:00Z');

test('averages last full month as the target when Actual has no budgets', () => {
  const v = buildBudgetView(cache, now, cfg);
  const dining = v.categories.find((c) => c.name === 'Dining');
  assert.equal(dining.target, 30000);
  assert.equal(dining.spent, 26000);
  assert.equal(dining.pace, Math.round(30000 * 13 / 31));
  assert.equal(dining.status, 'over');
  assert.equal(v.totals.targetSource, 'average');
  assert.equal(v.totals.target, 90000);
});

test('ranks interest above category pacing and keeps bills out of pace', () => {
  const v = buildBudgetView(cache, now, cfg);
  assert.deepEqual(v.actions.map((a) => a.id), ['2026-10:interest', '2026-10:cat:Dining', '2026-10:bill:Housing']);
  assert.equal(v.categories.some((c) => c.name === 'Housing'), false);
  assert.equal(v.bills[0].status, 'upcoming');
  assert.equal(v.actions[0].step, 'Send spare cash to Rewards Visa first ($1,500, charged $50 recently).');
  assert.equal(v.cash, 300000);
  assert.equal(v.debt, 150000);
});

test('flags stale imports first and ends the actual line at the last transaction', () => {
  const v = buildBudgetView(cache, new Date('2026-10-20T19:00:00Z'), cfg);
  assert.equal(v.actions[0].title, 'Transactions stop at Oct 12');
  assert.equal(v.burn.actualEnd, 12);
  assert.equal(v.burn.actual.at(-1).cumulative, 26000 + 10000);
});

test('uses Actual budgets when set', () => {
  const v = buildBudgetView({ ...cache, budgets: { '2026-10': { Dining: 100000 } } }, now, cfg);
  const dining = v.categories.find((c) => c.name === 'Dining');
  assert.equal(dining.source, 'budget');
  assert.equal(dining.status, 'ok');
});
