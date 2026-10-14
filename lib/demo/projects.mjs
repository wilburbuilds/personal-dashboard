/* Demo data for Projects v5 (overview, board, card detail). Moves are kept in memory only. */
const day = 864e5;
const iso = (d) => new Date(Date.now() + d * day).toISOString();
const L = { home: { title: 'home', color: '#4caf8f' }, elec: { title: 'electrical', color: '#e2a03f' }, proj: { title: 'project', color: '#7b8cff' }, urgent: { title: 'urgent', color: '#e5484d' } };
const card = (id, title, x = {}) => ({ id, ref: `#${id}`, title, done: false, due: null, priority: 0, percent: 0, position: id * 100, labels: [], assignees: [], hasDescription: false, ...x });
const BOARDS = {
  1: { title: 'Home', parent: null, columns: [
    { id: 1, title: 'To do', limit: 0, kind: 'open', cards: [card(11, 'Replace hallway light fixture', { labels: [L.elec], hasDescription: true, priority: 2 }), card(12, 'Research water filter options'), card(13, 'Donate old bike', { due: iso(-2) })] },
    { id: 2, title: 'Doing', limit: 3, kind: 'doing', cards: [card(21, 'Paint the spare room', { percent: 60, labels: [L.proj], assignees: ['Sam Rivera'], due: iso(3) }), card(22, 'Book furnace service', { labels: [L.home, L.urgent], priority: 4, due: iso(1) })] },
    { id: 3, title: 'Done', limit: 0, kind: 'done', cards: [card(31, 'Clean gutters', { done: true }), card(32, 'Change smoke detector batteries', { done: true })] },
  ] },
};
const state = structuredClone(BOARDS);
const summaries = () => [
  sum(1, 'Home', null, false, iso(-0.1)),
  { id: 2, title: 'Garden', parent: null, archived: false, color: '#4caf8f', open: 4, doing: 1, done: 7, overdue: 1, updated: iso(-1.2), url: 'https://vikunja.example.com/projects/2' },
  { id: 3, title: 'Side project', parent: null, archived: false, color: '#7b8cff', open: 6, doing: 2, done: 12, overdue: 0, updated: iso(-0.4), url: 'https://vikunja.example.com/projects/3' },
  { id: 4, title: 'Website', parent: 'Side project', archived: false, color: '', open: 3, doing: 0, done: 5, overdue: 0, updated: iso(-6), url: 'https://vikunja.example.com/projects/4' },
  { id: 5, title: 'Trip planning', parent: null, archived: false, color: '#e2a03f', open: 2, doing: 1, done: 0, overdue: 0, updated: iso(-3), url: 'https://vikunja.example.com/projects/5' },
  { id: 6, title: 'Old move checklist', parent: null, archived: true, color: '', open: 0, doing: 0, done: 31, overdue: 0, updated: iso(-90), url: 'https://vikunja.example.com/projects/6' },
];
function sum(id, title, parent, archived, updated) {
  const cols = state[id].columns; const c = (k) => cols.filter((x) => x.kind === k).reduce((n, x) => n + x.cards.length, 0);
  const overdue = cols.filter((x) => x.kind !== 'done').flatMap((x) => x.cards).filter((t) => t.due && Date.parse(t.due) < Date.now()).length;
  return { id, title, parent, archived, color: '#4caf8f', open: c('open'), doing: c('doing'), done: c('done'), overdue, updated, url: `https://vikunja.example.com/projects/${id}` };
}
export const demoOverview = () => ({ projects: summaries(), publicURL: 'https://vikunja.example.com' });
export function demoProjectBoard(id) {
  const b = state[id] ?? state[1]; const pid = state[id] ? id : 1;
  return { project: { id: pid, title: b.title, parent: b.parent, archived: false, url: `https://vikunja.example.com/projects/${pid}/4` }, viewId: 4, doneBucketId: 3, writable: true, columns: structuredClone(b.columns) };
}
export function demoTaskDetail(id) {
  const c = Object.values(state).flatMap((b) => b.columns.flatMap((x) => x.cards)).find((x) => x.id === id) ?? card(id, 'Demo task');
  return { ...c, description: id === 11 ? '## Plan\n\n- Pick a **flush mount** fixture\n- Turn off the breaker first\n- [ ] Buy wire nuts\n\nSee the [manual](https://example.com).' : '', created: new Date(Date.now() - 9 * day).toISOString(), updated: new Date(Date.now() - day).toISOString(), doneAt: null,
    comments: id === 11 ? [{ id: 1, author: 'Sam Rivera', at: new Date(Date.now() - 2 * day).toISOString(), body: '<p>The hardware store has the <b>brushed nickel</b> one.</p>' }] : [], url: `https://vikunja.example.com/tasks/${id}` };
}
export function demoMove(m) {
  const cols = (state[m.projectId] ?? state[1]).columns;
  let t = null;
  for (const c of cols) { const i = c.cards.findIndex((x) => x.id === m.taskId); if (i >= 0) t = c.cards.splice(i, 1)[0]; }
  const to = cols.find((c) => c.id === m.bucketId);
  if (!t || !to) throw new Error('Unknown card or column');
  t.position = m.position; t.done = to.kind === 'done'; to.cards.push(t); to.cards.sort((a, b) => a.position - b.position);
  return { done: t.done };
}
