// Read-only snapshot of Actual into the dashboard cache. Never calls a mutating API.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homeConfig } from '../lib/home-config.mjs';
import { ptDate, shiftMonth } from '../lib/budget/model.mjs';

const api = createRequire(import.meta.url)('@actual-app/api');
const { actual, dataDir } = homeConfig;
const out = join(dataDir, 'budget.json');
const statusFile = join(dataDir, 'budget-sync-status.json');

function password() {
  if (process.env.ACTUAL_SERVER_PASSWORD) return process.env.ACTUAL_SERVER_PASSWORD;
  return execFileSync('security', ['find-generic-password', '-a', actual.keychainAccount, '-s', actual.keychainService, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
function writePrivate(path, value) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, path);
}

async function main() {
  mkdirSync(join(dataDir, 'actual'), { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const startedAt = new Date().toISOString();
  const silence = console.log;
  console.log = () => {};
  await api.init({ dataDir: join(dataDir, 'actual'), serverURL: actual.serverURL, password: password() });
  try {
    await api.downloadBudget(actual.syncId);
    const budgets = await api.getBudgets();
    const budgetName = budgets.find((b) => b.groupId === actual.syncId)?.name || 'Budget';
    const today = ptDate(new Date());
    const month = today.slice(0, 7);
    const start = shiftMonth(month, -6) + '-01';
    const rows = (await api.runQuery(api.q('transactions')
      .filter({ date: { $gte: start }, transfer_id: null })
      .select(['date', 'amount', 'category.name', 'account.name', 'account.offbudget', 'payee.name']))).data;
    const transactions = rows.filter((r) => !r['account.offbudget']).map((r) => ({
      date: r.date, amount: r.amount, category: r['category.name'] || 'Uncategorized', account: r['account.name'], payee: r['payee.name'] || '',
    }));
    const budgetMonths = {};
    const known = new Set(await api.getBudgetMonths());
    for (let i = -6; i <= 0; i++) {
      const m = shiftMonth(month, i);
      if (!known.has(m)) continue;
      const bm = await api.getBudgetMonth(m);
      budgetMonths[m] = Object.fromEntries(bm.categoryGroups.flatMap((g) => g.categories).filter((c) => c.budgeted > 0).map((c) => [c.name, c.budgeted]));
    }
    const cutoff = new Date(Date.now() - 30 * 86400000);
    const accounts = [];
    for (const a of await api.getAccounts()) {
      if (a.offbudget) continue;
      accounts.push({ name: a.name, closed: !!a.closed, balance: await api.getAccountBalance(a.id), balance30: await api.getAccountBalance(a.id, cutoff) });
    }
    writePrivate(out, { fetchedAt: new Date().toISOString(), budgetName, transactions, budgets: budgetMonths, accounts });
    writePrivate(statusFile, { ok: true, startedAt, finishedAt: new Date().toISOString() });
  } finally {
    await api.shutdown().catch(() => {});
    console.log = silence;
  }
}

main().then(() => console.log('budget sync ok')).catch((e) => {
  try { writePrivate(statusFile, { ok: false, error: String(e?.message || e).slice(0, 300), finishedAt: new Date().toISOString() }); } catch {}
  console.error('budget sync failed:', e?.message || e);
  process.exit(1);
});
