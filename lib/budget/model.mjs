const TZ = 'America/Los_Angeles';

export function ptDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
function dayDiff(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
const monthName = (month, style = 'long') =>
  new Intl.DateTimeFormat('en-US', { month: style, timeZone: 'UTC' }).format(new Date(month + '-15T00:00:00Z'));
export const usd = (cents, digits = 0) =>
  (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const shortDate = (iso) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
const CREDIT = /card|visa|amex|mastercard|discover|credit/i;

/**
 * Turns the cached Actual snapshot into everything the Budget tab renders.
 * Money is integer cents throughout; spend is positive.
 */
export function buildBudgetView(cache, now, cfg) {
  const today = ptDate(now);
  const month = today.slice(0, 7);
  const day = Number(today.slice(8));
  const days = daysIn(month);
  const daysLeft = days - day + 1;
  const kindOf = (name) =>
    cfg.incomeCategories.includes(name) ? 'income'
      : cfg.debtCostCategories.includes(name) ? 'debt'
        : cfg.fixedCategories.includes(name) ? 'fixed' : 'flex';

  const tx = cache.transactions.map((t) => ({ ...t, month: t.date.slice(0, 7), day: Number(t.date.slice(8)), kind: kindOf(t.category), spend: -t.amount }));
  const firstDate = tx.reduce((m, t) => (t.date < m ? t.date : m), today);
  const lastDate = tx.reduce((m, t) => (t.date > m ? t.date : m), '');
  const firstMonth = firstDate.slice(0, 7);
  const firstFull = firstDate.slice(8) === '01' ? firstMonth : shiftMonth(firstMonth, 1);
  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).filter((m) => m >= firstFull || m === month);
  const complete = history.filter((m) => m < month);
  const spentBy = new Map();
  for (const t of tx) {
    const k = t.month + '|' + t.category;
    spentBy.set(k, (spentBy.get(k) || 0) + t.spend);
  }
  const spent = (m, c) => spentBy.get(m + '|' + c) || 0;
  const names = [...new Set(tx.map((t) => t.category).concat(Object.keys(cache.budgets[month] || {})))];

  const targetFor = (m, c) => {
    const b = cache.budgets[m]?.[c] || 0;
    if (b > 0) return { target: b, source: 'budget' };
    const prior = complete.filter((x) => x < m);
    if (!prior.length) return { target: 0, source: 'none' };
    const avg = Math.round(prior.reduce((s, x) => s + Math.max(0, spent(x, c)), 0) / prior.length);
    return { target: avg, source: avg > 0 ? 'average' : 'none' };
  };

  const categories = names.filter((c) => kindOf(c) === 'flex').map((name) => {
    const s = Math.max(0, spent(month, name));
    const { target, source } = targetFor(month, name);
    const pace = Math.round((target * day) / days);
    const projection = Math.round((s / day) * days);
    const overBy = s - pace;
    const status = !target ? (s > 0 ? 'none' : 'idle') : overBy > cfg.overThreshold * target ? 'over' : overBy > 0 ? 'warn' : 'ok';
    return {
      name, spent: s, target, source, pace, projection, overBy, status,
      remaining: target - s, dailyRoom: Math.max(0, Math.round((target - s) / daysLeft)),
      history: history.map((m) => ({ month: m, spent: Math.max(0, spent(m, name)), target: targetFor(m, name).target })),
    };
  }).filter((c) => c.spent > 0 || c.target > 0);

  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const flexTarget = sum(categories, (c) => c.target);
  const flexSpent = sum(categories, (c) => c.spent);
  const asOfDay = lastDate.slice(0, 7) === month ? Number(lastDate.slice(8)) : lastDate < month ? 0 : day;
  const staleDays = lastDate ? dayDiff(lastDate, today) : null;
  const totals = {
    spent: flexSpent, target: flexTarget,
    pace: Math.round((flexTarget * day) / days),
    projection: Math.round((flexSpent / day) * days),
    left: flexTarget - flexSpent,
    dailyRoom: Math.max(0, Math.round((flexTarget - flexSpent) / daysLeft)),
    overPace: flexSpent - Math.round((flexTarget * day) / days),
    targetSource: categories.some((c) => c.source === 'budget') ? 'budget' : flexTarget > 0 ? 'average' : 'none',
  };

  const flexTx = tx.filter((t) => t.kind === 'flex');
  const cumulative = (m, upto) => {
    const perDay = Array(daysIn(m) + 1).fill(0);
    for (const t of flexTx) if (t.month === m) perDay[t.day] += t.spend;
    const out = [];
    let run = 0;
    for (let d = 1; d <= upto; d++) { run += perDay[d]; out.push({ day: d, spentToday: perDay[d], cumulative: run }); }
    return out;
  };
  const prev = shiftMonth(month, -1);
  const actualEnd = staleDays !== null && staleDays >= cfg.staleAfterDays ? Math.max(1, asOfDay) : day;
  const burn = {
    days, today: day, actualEnd,
    actual: cumulative(month, actualEnd),
    lastMonth: history.includes(prev) ? cumulative(prev, daysIn(prev)).map((p) => ({ day: p.day, cumulative: p.cumulative })) : [],
    target: flexTarget,
    projectionEnd: totals.projection,
  };

  const trend = history.map((m) => {
    const cats = names.filter((c) => kindOf(c) === 'flex');
    const s = sum(cats, (c) => Math.max(0, spent(m, c)));
    const t = sum(cats, (c) => targetFor(m, c).target);
    return { month: m, label: monthName(m, 'short'), spent: s, target: t, current: m === month, projection: m === month ? totals.projection : null };
  });

  const shareTotal = flexSpent;
  const ranked = [...categories].filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const share = ranked.slice(0, 5).map((c) => ({ name: c.name, spent: c.spent, pct: shareTotal ? c.spent / shareTotal : 0 }));
  const rest = sum(ranked.slice(5), (c) => c.spent);
  if (rest > 0) share.push({ name: 'Other', spent: rest, pct: rest / shareTotal });

  const accounts = cache.accounts.filter((a) => !a.closed).map((a) => ({
    name: a.name, balance: a.balance, change30: a.balance - a.balance30, kind: a.balance < 0 || CREDIT.test(a.name) ? 'credit' : 'cash',
  }));
  const cash = sum(accounts.filter((a) => a.kind === 'cash'), (a) => a.balance);
  const debt = -sum(accounts.filter((a) => a.kind === 'credit'), (a) => Math.min(0, a.balance));

  const bills = names.filter((c) => kindOf(c) === 'fixed').map((name) => {
    const last = tx.filter((t) => t.category === name && t.month === prev);
    const lastAmount = Math.max(0, sum(last, (t) => t.spend));
    const paid = Math.max(0, spent(month, name));
    const dueDay = last.length ? Math.min(days, Math.min(...last.map((t) => t.day))) : null;
    const status = paid > 0 && paid >= lastAmount * 0.9 ? 'paid' : lastAmount > 0 ? 'upcoming' : 'none';
    const due = dueDay ? `${month}-${String(dueDay).padStart(2, '0')}` : null;
    return { name, lastAmount, paid, status, due, dueIn: due ? dayDiff(today, due) : null, expected: Math.max(0, lastAmount - paid) };
  }).filter((b) => b.status !== 'none');

  const debtCost = (m) => tx.filter((t) => t.kind === 'debt' && t.month === m);
  const interestPrev = debtCost(prev);
  const interestNow = debtCost(month);

  const actions = [];
  if (staleDays !== null && staleDays >= cfg.staleAfterDays) {
    actions.push({
      id: `${month}:stale:${lastDate}`, tone: 'warn', rank: Number.MAX_SAFE_INTEGER,
      title: `Transactions stop at ${shortDate(lastDate)}`,
      body: `Actual has nothing after ${shortDate(lastDate)}, so ${staleDays} days of spending are missing and every number here reads low.`,
      step: 'Import or sync your bank accounts in Actual, then press Sync now.',
      link: { label: 'Open Actual', href: cfg.actualURL },
    });
  }
  const interestTotal = sum(interestPrev, (t) => t.spend);
  if (interestTotal > 0) {
    const charged = {};
    for (const t of [...interestPrev, ...interestNow]) charged[t.account] = (charged[t.account] || 0) + t.spend;
    const owing = accounts.filter((a) => a.kind === 'credit' && a.balance < 0);
    const target = owing.filter((a) => charged[a.name] > 0).sort((a, b) => charged[b.name] - charged[a.name])[0]
      ?? [...owing].sort((a, b) => a.balance - b.balance)[0];
    const nowTotal = sum(interestNow, (t) => t.spend);
    actions.push({
      id: `${month}:interest`, tone: 'over', rank: interestTotal * 12,
      title: `Card interest cost ${usd(interestTotal)} in ${monthName(prev)}`,
      body: `You carry ${usd(debt)} on cards against ${usd(cash)} in cash${nowTotal ? `, and ${usd(nowTotal)} more interest has posted this month` : ''}. At this rate that is about ${usd(interestTotal * 12)} a year.`,
      step: target ? `Send spare cash to ${target.name} first (${usd(-target.balance)}${charged[target.name] ? `, charged ${usd(charged[target.name])} recently` : ''}).` : 'Pay card balances in full to stop the interest.',
      link: { label: 'Open Actual', href: cfg.actualURL },
    });
  }
  const room = [...categories].filter((c) => c.target > 0 && c.pace - c.spent > 0).sort((a, b) => (b.pace - b.spent) - (a.pace - a.spent));
  const monthEnd = shortDate(`${month}-${String(days).padStart(2, '0')}`);
  for (const c of categories.filter((x) => x.status === 'over' || x.status === 'warn')) {
    const donor = room.find((r) => r.name !== c.name);
    const move = donor ? Math.min(Math.ceil(c.overBy / 1000) * 1000, Math.floor((donor.pace - donor.spent) / 1000) * 1000) : 0;
    const perDay = Math.max(0, Math.floor((c.target - c.spent) / daysLeft / 100) * 100);
    actions.push({
      id: `${month}:cat:${c.name}`, tone: c.status, rank: c.overBy,
      title: c.status === 'over' ? `${c.name} is over pace` : `${c.name} is slightly over pace`,
      body: `${usd(c.spent)} spent, ${usd(c.overBy)} past where pace says you should be. At this rate it lands near ${usd(c.projection)} against ${usd(c.target)}.`,
      step: c.status === 'over'
        ? (c.source === 'average' && c.spent > 2 * c.target ? `That is far above last month's ${usd(c.target)}. If it's a one-off, cover it once; if it's the new normal, set a budget for it in Actual.` : perDay > 0 ? `Keep ${c.name.toLowerCase()} to ${usd(perDay)}/day until ${monthEnd}.` : `${c.name} is past its ${usd(c.target)} for the month. Hold off until ${monthName(shiftMonth(month, 1), 'short')} 1.`)
        : `Hold ${c.name.toLowerCase()} to about ${usd(Math.max(0, Math.round(((c.target - c.spent) / daysLeft) * 7)))} a week.`,
      move: cfg.suggestMoves && move > 0 ? `Cover it with ${usd(move)} from ${donor.name}` : null,
      link: { label: 'Open in Actual', href: cfg.actualURL },
    });
  }
  for (const b of bills.filter((x) => x.status === 'upcoming' && x.dueIn !== null && x.dueIn >= -3 && x.dueIn <= cfg.billWindowDays)) {
    actions.push({
      id: `${month}:bill:${b.name}`, tone: 'info', rank: b.expected / 10,
      title: `${b.name} due around ${shortDate(b.due)}`,
      body: `About ${usd(b.expected)} based on last month. Cash on hand ${cash >= b.expected ? `covers it, leaving ${usd(cash - b.expected)}` : `is ${usd(b.expected - cash)} short`}.`,
      step: cash >= b.expected ? 'Covered by your cash accounts.' : 'Move money into checking before it posts.',
    });
  }
  actions.sort((a, b) => b.rank - a.rank);

  let sentence;
  const top = [...categories].filter((c) => c.overBy > 0).sort((a, b) => b.overBy - a.overBy)[0];
  if (!totals.target) sentence = [{ t: `${usd(totals.spent)} spent in ${monthName(month)} so far.` }];
  else if (totals.left < 0) sentence = [{ t: `${usd(-totals.left)} over`, tone: 'over' }, { t: ` your ${usd(totals.target)} target${top ? `, mostly ${top.name.toLowerCase()}` : ''}.` }];
  else if (totals.overPace > 0) sentence = [{ t: `${usd(totals.left)} left for ${daysLeft} days. You're ` }, { t: `${usd(totals.overPace)} over pace`, tone: 'over' }, { t: top ? `, mostly ${top.name.toLowerCase()}.` : '.' }];
  else sentence = [{ t: `${usd(totals.left)} left for ${daysLeft} days. You're ` }, { t: `${usd(-totals.overPace)} under pace`, tone: 'ok' }, { t: '.' }];

  if (staleDays !== null && staleDays >= cfg.staleAfterDays) sentence.push({ t: ` Numbers stop at ${shortDate(lastDate)}.`, tone: 'muted' });

  return {
    month, monthLabel: `${monthName(month)} ${month.slice(0, 4)}`, today, day, days, daysLeft,
    lastDate, staleDays, totals, sentence, categories, burn, trend, share, accounts,
    cash, debt, net: sum(accounts, (a) => a.balance), bills, actions: actions.slice(0, cfg.maxActions + 3),
    calm: actions.length ? null : `On pace. ${usd(totals.dailyRoom)}/day of room.`,
    fetchedAt: cache.fetchedAt, budgetName: cache.budgetName,
  };
}
