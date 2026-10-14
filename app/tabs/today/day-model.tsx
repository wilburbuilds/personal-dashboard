/** Pure timeline + lead-sentence rules for Today v2 (homeConfig.today.lead = 'rules'). */
export type Tonight = { title: string; time: string | null; duration: number[] | null };
export type CalItem = { title: string; time?: string; detail?: string; summary?: string; url?: string; label?: string };
export type Ev = { key: string; title: string; detail?: string; url?: string; timeLabel: string; start: number; end: number | null; past: boolean; workout: boolean };
type Band = { name: 'Morning' | 'Afternoon' | 'Evening'; events: Ev[]; nowIndex: number };

const TZ = 'America/Los_Angeles';
export const minuteNow = (d: Date) => { const p = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: TZ }).formatToParts(d); return Number(p.find((x) => x.type === 'hour')!.value) % 24 * 60 + Number(p.find((x) => x.type === 'minute')!.value); };
export function parseClock(s: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(s);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2] ?? 0);
}
const short = (s: string) => s.replace(/:00(?=\s*[AP]M)/i, '').replace(/\s*[AP]M$/i, '');
const WORKOUT = /strength|workout|gym|push|pull|lower body|squat|deadlift|lift/i;
const sessionWord = (s: string) => (/push/i.test(s) ? 'push day' : /pull/i.test(s) ? 'pull day' : /lower/i.test(s) ? 'lower-body day' : /squat|deadlift/i.test(s) ? 'squat and deadlift' : 'your workout');

export function buildDay(items: CalItem[], tonight: Tonight | null, now: Date) {
  const nowMin = minuteNow(now);
  const allDay: Ev[] = [];
  const evs: Ev[] = [];
  items.forEach((it, i) => {
    const t = it.time || '';
    if (!t || /all day/i.test(t)) { allDay.push({ key: `a${i}`, title: it.title, detail: it.detail, url: it.url, timeLabel: 'All day', start: -1, end: null, past: false, workout: false }); return; }
    const [a, b] = t.split(/[–-]/);
    const start = parseClock(a);
    if (start === null) { allDay.push({ key: `a${i}`, title: it.title, detail: it.detail, url: it.url, timeLabel: t, start: -1, end: null, past: false, workout: false }); return; }
    const end = b ? parseClock(b) : null;
    evs.push({ key: `e${i}`, title: it.title, detail: it.detail, url: it.url, timeLabel: a.trim(), start, end, past: (end ?? start + 30) <= nowMin, workout: false });
  });
  if (tonight?.time) {
    const ws = parseClock(tonight.time)!;
    const dur = tonight.duration?.[0] ?? 30;
    const match = evs.find((e) => WORKOUT.test(e.title) && Math.abs(e.start - ws) <= 45);
    const detail = `From your program, about ${dur} min`;
    if (match) Object.assign(match, { workout: true, detail });
    else evs.push({ key: 'workout', title: tonight.title, detail, timeLabel: tonight.time, start: ws, end: ws + dur, past: ws + dur <= nowMin, workout: true });
  }
  evs.sort((a, b) => a.start - b.start);
  const bandOf = (m: number): Band['name'] => (m < 12 * 60 ? 'Morning' : m < 17 * 60 ? 'Afternoon' : 'Evening');
  const nowBand = bandOf(nowMin);
  const names: Band['name'][] = ['Morning', 'Afternoon', 'Evening'];
  const bands: Band[] = names.map((name) => {
    const events = evs.filter((e) => bandOf(e.start) === name);
    const idx = events.findIndex((e) => e.start > nowMin);
    return { name, events, nowIndex: idx === -1 ? events.length : idx };
  }).filter((b) => b.events.length || b.name === nowBand);
  const upcoming = evs.filter((e) => !e.past && !e.workout); // includes anything still in progress
  const workout = evs.find((e) => e.workout && !e.past) ?? null;
  return { allDay, bands, nowBand, upcoming, workout, empty: !evs.some((e) => !e.past) && !allDay.length };
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export function leadSentence(day: ReturnType<typeof buildDay>, replyFrom: string | null) {
  const n = day.upcoming.length;
  const left = n === 0 ? (day.workout ? 'Calendar’s clear' : 'Nothing else on the calendar today') : `${WORDS[n] ?? n} ${n === 1 ? 'thing' : 'things'} left today`;
  const w = day.workout ? <>, then <b>{sessionWord(day.workout.title)} at {short(day.workout.timeLabel)}</b></> : null;
  const who = replyFrom ? <> {replyFrom.split(/[<,]/)[0].trim()} is waiting on a reply.</> : null;
  return <>{left}{w}.{who}</>;
}
