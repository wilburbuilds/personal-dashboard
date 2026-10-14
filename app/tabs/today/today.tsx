'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, MapPin, RefreshCw, CircleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { emptySnapshot, defaultPreferences, keys, type Snapshot, type Preferences } from '@/lib/dashboard';
import type { MarketsSource } from '@/lib/markets.mjs';
import { buildDay, leadSentence, type Tonight, type Ev } from './day-model';

/** Today v2: the day is a timeline, everything else is what needs you. Same /api/dashboard data as before. */
type Api = { snapshot: Snapshot; preferences: Preferences; markets?: MarketsSource; tonight?: Tonight | null; error?: string };
const TZ = 'America/Los_Angeles';
const emptyMarkets: MarketsSource = { status: 'unconnected', updatedAt: null, strip: [], book: null, positions: [], note: 'Markets not loaded yet.' };
const WX = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const WXWORD = { sun: 'Sunny', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Storms' };
const clock = (d: Date | string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(d));
const NAMES: Partial<Record<(typeof keys)[number], string>> = { discord: 'Discord', home: 'Home Assistant', automations: 'scheduled tasks', calendar: 'calendar', overnight: 'overnight mail', followups: 'follow-ups', headlines: 'headlines', health: 'Fitbit', weather: 'weather' };

export default function TodayV2() {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [draft, setDraft] = useState<Preferences>(defaultPreferences);
  const [markets, setMarkets] = useState<MarketsSource>(emptyMarkets);
  const [tonight, setTonight] = useState<Tonight | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const useDevice = useRef(false);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const json = (await res.json()) as Api;
      if (!res.ok) throw Error(json.error);
      if (useDevice.current) {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no, { timeout: 10000, maximumAge: 300000 }) : no(Error('Unavailable')));
          const wr = await fetch('/api/weather', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }) });
          const ws = await wr.json();
          if (!wr.ok || !ws.weather) throw Error('Weather unavailable');
          json.snapshot.sources.weather = ws;
          setLocationNote('Using this device’s location while the dashboard is open.');
        } catch { setLocationNote('Location unavailable. Showing your saved city.'); }
      }
      setData(json.snapshot); setPrefs(json.preferences); setMarkets(json.markets || emptyMarkets); setTonight(json.tonight ?? null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Today couldn’t load.');
    } finally { setLoading(false); setNow(new Date()); }
  }

  useEffect(() => {
    useDevice.current = localStorage.getItem('weather-use-device') === 'true';
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    const tick = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(t); clearInterval(tick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaveError('');
    try {
      const r = await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(j.error);
      setPrefs(draft); useDevice.current = false; localStorage.removeItem('weather-use-device'); setLocationNote(''); setOpen(false); refresh();
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Couldn’t save.'); } finally { setSaving(false); }
  }

  const s = data.sources;
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }).format(now ?? new Date());
  const weather = s.weather?.weather;
  const WIcon = weather ? WX[weather.condition] : Cloud;
  const day = now ? buildDay(s.calendar?.items ?? [], tonight, now) : null;
  const replies = s.overnight?.status === 'ready' ? s.overnight.items : [];
  const lead = day ? leadSentence(day, replies[0]?.title ?? null) : null;
  const health = s.health;
  const metric = (label: RegExp) => health?.metrics?.find((m) => label.test(m.label));
  const unconnected = keys.filter((k) => s[k]?.status === 'unconnected' && NAMES[k]).map((k) => NAMES[k]!);
  const counts = /(\d+)\s+of\s+(\d+)/.exec(s.overnight?.note ?? '');

  return (
    <main className="hd-page t2">
      <header className="t2-hdr">
        <div>
          <p className="t2-date">{date}</p>
          <h1 className="t2-lead">{lead ?? (loaded ? 'Here’s today.' : <span className="hd-skel" style={{ height: 34, width: '28ch' }} />)}</h1>
        </div>
        <button className="t2-wx" onClick={() => { setDraft(prefs); setOpen(true); }} aria-label="Weather and preferences">
          <WIcon aria-hidden />
          <span>
            <b className="num">{weather ? <>{weather.high}°<span> / {weather.low}°</span></> : '—'}</b>
            <small>{weather ? `${WXWORD[weather.condition]} in ${weather.location}` : s.weather?.note || 'Weather'}</small>
          </span>
        </button>
      </header>

      {error ? <p className="t2-alert" role="alert"><CircleAlert aria-hidden />{error}{loaded ? ' Showing the last update.' : ''}<button className="hd-btn small" onClick={refresh}><RefreshCw aria-hidden className="hd-i" />Try again</button></p> : null}

      <div className="t2-grid">
        <div className="t2-left">
          <section className="t2-day" aria-labelledby="h-day">
            <h2 id="h-day" className="hd-sr">The day</h2>
            {s.calendar?.status === 'error' ? <p className="t2-note"><CircleAlert aria-hidden />{s.calendar.note}</p> : null}
            {!day ? <div className="t2-band"><h3>&nbsp;</h3><div className="t2-evs"><span className="hd-skel" style={{ height: 120 }} /></div></div> : <DayBands day={day} now={now!} />}
          </section>

          <section className="t2-sec t2-heads" aria-labelledby="h-hl">
            <div className="sh"><h2 id="h-hl">Headlines</h2><span className="m">Your topics</span></div>
            {s.headlines?.items?.length ? (
              <div className="t2-hgrid">
                {s.headlines.items.slice(0, 6).map((h, i) => (
                  <a className="t2-hl" key={i} href={h.url} target="_blank" rel="noreferrer"><b>{h.title}</b><span>{h.label}</span></a>
                ))}
              </div>
            ) : <p className="t2-empty">{s.headlines?.note || 'No headlines yet.'}</p>}
          </section>
        </div>

        <div className="t2-right">
          {replies.length ? (
            <section className="t2-sec" aria-labelledby="h-rp">
              <div className="sh"><h2 id="h-rp">Worth a reply</h2><span className="m">{counts ? `${counts[1]} of ${counts[2]} overnight` : `${replies.length} overnight`}</span></div>
              {replies.map((r, i) => {
                const inner = <><b>{r.title}</b><span className="when num">{r.time}</span>{r.detail ? <p>{r.detail}</p> : null}</>;
                return r.url ? <a key={i} className="t2-rp" href={r.url} target="_blank" rel="noreferrer">{inner}</a> : <div key={i} className="t2-rp">{inner}</div>;
              })}
            </section>
          ) : s.overnight?.status === 'error' ? (
            <section className="t2-sec"><div className="sh"><h2>Worth a reply</h2></div><p className="t2-note"><CircleAlert aria-hidden />{s.overnight.note}</p></section>
          ) : null}

          <section className="t2-sec" aria-labelledby="h-body">
            <div className="sh"><h2 id="h-body">Body</h2><span className="m">{health?.updatedAt ? `Fitbit, ${clock(health.updatedAt)}` : 'Fitbit'}</span><Link href="/t/health">Health</Link></div>
            {health?.status === 'error' ? <p className="t2-note"><CircleAlert aria-hidden />{health.note.split('. ').slice(1, 2).join('') || health.note}</p> : null}
            <div className="t2-body num">
              <Metric k="Sleep" v={metric(/sleep/i)?.value} />
              <Metric k="Resting HR" v={metric(/resting/i)?.value} u="bpm" />
              <Metric k={metric(/steps/i)?.label ?? 'Steps'} v={metric(/steps/i)?.value} />
            </div>
          </section>

          <section className="t2-sec" aria-labelledby="h-mk">
            <div className="sh"><h2 id="h-mk">Markets</h2><span className="m">{markets.updatedAt ? clock(markets.updatedAt) : ''}</span></div>
            {markets.status === 'error' ? <p className="t2-note"><CircleAlert aria-hidden />{markets.note}</p> : null}
            {markets.strip.length ? (
              <div className="t2-mk num">
                {markets.strip.map((q) => <div key={q.symbol}><div className="k">{q.symbol}</div><div className="mkv">{q.value}<span className={q.direction === 'up' ? 'up-t' : 'dn-t'}>{q.change}</span></div></div>)}
              </div>
            ) : markets.status !== 'error' ? <p className="t2-empty">{markets.note}</p> : null}
            {markets.book ? (
              <div className="t2-ps t2-book num">
                <div><b>{markets.book.label === 'Today' ? 'Today’s book' : markets.book.label}</b><small>{markets.book.sub}{markets.positions.length ? `, ${markets.positions.length} positions` : ''}</small></div>
                <span />
                <span className={`r ${markets.book.direction === 'up' ? 'up-t' : 'dn-t'}`}>{markets.book.pct}</span>
                <span className={`r ${markets.book.direction === 'up' ? 'up-t' : 'dn-t'}`}>{markets.book.dollars}</span>
              </div>
            ) : null}
            {markets.positions.map((p, i) => (
              <div className="t2-ps num" key={`${p.ticker}-${p.detail}-${i}`}>
                <div><b>{p.ticker}</b><small>{p.detail || p.quantity}</small></div>
                {p.sparkline ? (
                  <svg viewBox="0 0 84 32" width="60" height="28" aria-hidden="true" preserveAspectRatio="none">
                    {p.sparkline.priorY != null ? <line x1="4" x2="80" y1={p.sparkline.priorY} y2={p.sparkline.priorY} stroke="var(--text-3)" strokeDasharray="1.5 2.5" strokeWidth="1" /> : null}
                    <polyline points={p.sparkline.points} fill="none" stroke={p.direction === 'up' ? 'var(--viz-ok)' : 'var(--viz-over)'} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : <span />}
                <span className={`r ${p.direction === 'up' ? 'up-t' : 'dn-t'}`}>{p.pct}</span>
                <span className={`r ${p.direction === 'up' ? 'up-t' : 'dn-t'}`}>{p.dollars}</span>
              </div>
            ))}
          </section>
        </div>
      </div>

      {unconnected.length ? (
        <p className="t2-nc">Not connected yet: {joinWords(unconnected)}. <button className="hd-linkish t2-link" onClick={() => { setDraft(prefs); setOpen(true); }}>Connect sources</button></p>
      ) : null}

      <Dialog open={open} onOpenChange={(v) => { if (v) setDraft(prefs); setOpen(v); }}>
        <DialogContent className="hd-tokens t2-dialog">
          <DialogHeader>
            <DialogTitle>Today settings</DialogTitle>
            <DialogDescription>Weather location, headline topics and notes about your sources. Account connections are set up on the Mac mini.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="t2-form">
            <label>Weather location<input value={draft.city} maxLength={150} placeholder="City, state or country" onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
            <button type="button" className="hd-btn small" onClick={() => { useDevice.current = true; localStorage.setItem('weather-use-device', 'true'); setOpen(false); refresh(); }}><MapPin aria-hidden className="hd-i" />Use this device’s location</button>
            {locationNote ? <p className="hd-faint" role="status">{locationNote}</p> : null}
            <label>Headline topics<textarea value={draft.topics} maxLength={500} placeholder="Topics, publications, things to skip" onChange={(e) => setDraft({ ...draft, topics: e.target.value })} /></label>
            <label>Your sources<textarea value={draft.sourceNotes} maxLength={2000} placeholder="Calendar, Discord channels, Home Assistant. No passwords or tokens." onChange={(e) => setDraft({ ...draft, sourceNotes: e.target.value })} /></label>
            {saveError ? <p role="alert" className="t2-err">{saveError}</p> : null}
            <button type="submit" className="hd-btn primary" disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
            <a className="hd-faint t2-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo</a>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ k, v, u }: { k: string; v?: string; u?: string }) {
  return <div><div className="k">{k}</div><div className="v">{v ?? '—'}{v && v !== '—' && u ? <small>{u}</small> : null}</div></div>;
}
const joinWords = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

function DayBands({ day, now }: { day: ReturnType<typeof buildDay>; now: Date }) {
  const past = day.bands.flatMap((b) => b.events).filter((e) => e.past);
  const row = (e: Ev, phoneHide = false): ReactNode => (
    <div key={e.key} className={`t2-ev${e.past ? ' past' : ''}${e.workout ? ' wk' : ''}${phoneHide ? ' ph-hide' : ''}`}>
      <span className="t num">{e.timeLabel}</span>
      <div>{e.url ? <a className="ttl" href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : <b className="ttl">{e.title}</b>}{e.detail ? <span className="d">{e.detail}</span> : null}</div>
      {e.workout ? <Link href="/t/health?view=workouts">Open in Health</Link> : null}
    </div>
  );
  const nowRule = <div className="t2-now" key="now" role="presentation"><span className="num">Now {clock(now)}</span></div>;
  return (
    <>
      {day.allDay.length ? (
        <div className="t2-band"><h3>All day</h3><div className="t2-evs">{day.allDay.map((e) => row(e))}</div></div>
      ) : null}
      {past.length ? (
        <div className="t2-band t2-earlier"><h3>Earlier</h3><div className="t2-evs"><div className="t2-ev past"><span className="t">{past.length} done</span><div><b className="ttl">{past.map((e) => e.title).join(', ')}</b></div></div></div></div>
      ) : null}
      {day.bands.map((b) => {
        const allPast = b.events.length > 0 && b.events.every((e) => e.past) && b.name !== day.nowBand;
        return (
          <div className={`t2-band${allPast ? ' ph-hide' : ''}`} key={b.name}>
            <h3>{b.name}</h3>
            <div className="t2-evs">
              {b.events.map((e, i) => (
                <FragmentWithNow key={e.key} show={b.name === day.nowBand && i === b.nowIndex} rule={nowRule}>{row(e, e.past)}</FragmentWithNow>
              ))}
              {b.name === day.nowBand && b.nowIndex >= b.events.length ? nowRule : null}
              {!b.events.length ? <p className="t2-empty">Nothing on the calendar.</p> : null}
            </div>
          </div>
        );
      })}
      {day.empty ? <p className="t2-empty t2-pad">Nothing else on the calendar today.</p> : null}
    </>
  );
}
function FragmentWithNow({ show, rule, children }: { show: boolean; rule: ReactNode; children: ReactNode }) {
  return <>{show ? rule : null}{children}</>;
}
