'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, RefreshCw, SlidersHorizontal, CircleAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { emptySnapshot, defaultPreferences, keys, type Snapshot, type Preferences } from '@/lib/dashboard';
import type { MarketsSource } from '@/lib/markets.mjs';
import type { XTrends } from '@/lib/x-trends.mjs';
import type { TodayData } from './plugin';
import { WeatherSheet } from './weather-sheet';
import { DueToday } from './due-today';
import { MicField } from '@/components/home/mic';
import { buildDay, leadSentence, type Tonight, type Ev } from './day-model';

/** Today v2: the day is a timeline, everything else is what needs you. Same /api/dashboard data as before. */
type Api = { snapshot: Snapshot; preferences: Preferences; markets?: MarketsSource; tonight?: Tonight | null; xTrends?: XTrends; error?: string };
const DEF: TodayData = { lead: 'rules', headlines: 3, trends: 3, positions: 6, holdingsStaleHours: 24 };
const POS_KEY = 'hd-today-positions-open';
const TZ = 'America/Los_Angeles';
const emptyMarkets: MarketsSource = { status: 'unconnected', updatedAt: null, strip: [], book: null, positions: [], note: 'Markets not loaded yet.' };
const WX = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const WXWORD = { sun: 'Sunny', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Storms' };
const clock = (d: Date | string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(d));
const NAMES: Partial<Record<(typeof keys)[number], string>> = { discord: 'Discord', home: 'Home Assistant', automations: 'scheduled tasks', calendar: 'calendar', overnight: 'overnight mail', followups: 'follow-ups', headlines: 'headlines', health: 'Fitbit', weather: 'weather' };

export default function TodayV2({ data: tabData }: { data?: Partial<TodayData>; fetchedAt?: Date }) {
  const cfg = { ...DEF, ...tabData };
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [markets, setMarkets] = useState<MarketsSource>(emptyMarkets);
  const [tonight, setTonight] = useState<Tonight | null>(null);
  const [trends, setTrends] = useState<XTrends | null>(null);
  const [wxOpen, setWxOpen] = useState(false);
  const [allPos, setAllPos] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const json = (await res.json()) as Api;
      if (!res.ok) throw Error(json.error);
      setLocationNote('');
      if (json.preferences?.deviceLocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no, { timeout: 10000, maximumAge: 300000 }) : no(Error('Unavailable')));
          const wr = await fetch('/api/weather', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }) });
          const ws = await wr.json();
          if (!wr.ok || !ws.weather) throw Error('Weather unavailable');
          json.snapshot.sources.weather = ws;
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } catch { setCoords(null); setLocationNote('Location unavailable here. Showing your saved city.'); }
      }
      setData(json.snapshot); setPrefs(json.preferences); setMarkets(json.markets || emptyMarkets); setTonight(json.tonight ?? null); setTrends(json.xTrends ?? null); setAllPos(localStorage.getItem(POS_KEY) === '1');
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Today couldn’t load.');
    } finally { setLoading(false); setNow(new Date()); }
  }

  useEffect(() => {
    localStorage.removeItem('weather-use-device');
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    const tick = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(t); clearInterval(tick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Partial save to the server settings (prefs). Resolves to an error message, or null. */
  async function savePrefs(patch: Partial<Preferences>): Promise<string | null> {
    try {
      const r = await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = (await r.json()) as { error?: string; preferences?: Preferences };
      if (!r.ok) throw Error(j.error);
      if (j.preferences) setPrefs(j.preferences);
      refresh();
      return null;
    } catch (err) { return err instanceof Error && err.message ? err.message : 'Couldn’t save.'; }
  }

  const s = data.sources;
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }).format(now ?? new Date());
  const weather = s.weather?.weather;
  const WIcon = weather ? WX[weather.condition] : Cloud;
  const day = now ? buildDay(s.calendar?.items ?? [], tonight, now) : null;
  const replies = s.overnight?.status === 'ready' ? s.overnight.items : [];
  const leadOn = cfg.lead !== 'off';
  const lead = day && leadOn ? leadSentence(day, replies[0]?.title ?? null) : null;
  const health = s.health;
  const metric = (label: RegExp) => health?.metrics?.find((m) => label.test(m.label));
  const unconnected = keys.filter((k) => s[k]?.status === 'unconnected' && NAMES[k]).map((k) => NAMES[k]!);
  const counts = /(\d+)\s+of\s+(\d+)/.exec(s.overnight?.note ?? '');

  return (
    <main className="hd-page t2">
      <header className="t2-hdr">
        <div>
          <p className="t2-date">{date}</p>
          <h1 className="t2-lead">{lead ?? (loaded || !leadOn ? 'Here’s today.' : <span className="hd-skel" style={{ height: 34, width: '28ch' }} />)}</h1>
        </div>
        <button className="t2-wx" onClick={() => setWxOpen(true)} aria-haspopup="dialog" aria-label={weather ? `Weather: ${WXWORD[weather.condition]}, high ${weather.high}, low ${weather.low}. Open forecast` : 'Open weather'}>
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
            <div className="sh"><h2 id="h-hl">Headlines</h2><TopicsControl topics={prefs.topics} onSave={(topics) => savePrefs({ topics })} /></div>
            {cfg.headlines ? (s.headlines?.items?.length ? (
              <div className="t2-hgrid">
                {s.headlines.items.slice(0, cfg.headlines).map((h, i) => (
                  <a className="t2-hl" key={i} href={h.url} target="_blank" rel="noreferrer"><b>{h.title}</b><span>{h.label}</span></a>
                ))}
              </div>
            ) : <p className="t2-empty">{s.headlines?.note || 'No headlines yet.'}</p>) : null}
            {cfg.trends ? <Trends t={trends} n={cfg.trends} /> : null}
          </section>
        </div>

        <div className="t2-right">
          <DueToday />
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

          <Link href="/t/health" className="t2-sec t2-card" aria-labelledby="h-body" aria-describedby="h-body-m">
            <div className="sh"><h2 id="h-body">Body</h2><span className="m" id="h-body-m">{health?.updatedAt ? `Fitbit, ${clock(health.updatedAt)}` : 'Fitbit'}</span><span className="t2-go" aria-hidden>Health<ChevronRight /></span></div>
            {health?.status === 'error' ? <p className="t2-note"><CircleAlert aria-hidden />{health.note.split('. ').slice(1, 2).join('') || health.note}</p> : null}
            <div className="t2-body num">
              <Metric k="Sleep" v={metric(/sleep/i)?.value} />
              <Metric k="Resting HR" v={metric(/resting/i)?.value} u="bpm" />
              <Metric k={metric(/steps/i)?.label ?? 'Steps'} v={metric(/steps/i)?.value} />
            </div>
          </Link>

          <section className="t2-sec" aria-labelledby="h-mk">
            <div className="sh"><h2 id="h-mk">Markets</h2><span className="m">{markets.updatedAt ? `Quotes ${clock(markets.updatedAt)}` : ''}</span></div>
            {markets.status === 'error' ? <p className="t2-note"><CircleAlert aria-hidden />{markets.note}</p> : null}
            {markets.strip.length ? (
              <div className="t2-mk num">
                {markets.strip.map((q) => <div key={q.symbol}><div className="k">{q.symbol}</div><div className="mkv">{q.value}<span className={q.direction === 'up' ? 'up-t' : 'dn-t'}>{q.change}</span></div></div>)}
              </div>
            ) : markets.status !== 'error' ? <p className="t2-empty">{markets.note}</p> : null}
            {markets.positions.length || markets.book ? (
              <div className="t2-pos">
                <div className="t2-posh">
                  <h3>Positions</h3>
                  <Synced at={markets.holdingsAt ?? null} now={now} staleHours={cfg.holdingsStaleHours} />
                </div>
                {markets.book ? (
                  <div className="t2-ps t2-book num">
                    <div><b>{markets.book.label === 'Today' ? 'Today’s book' : markets.book.label}</b><small>{markets.book.sub}{markets.positions.length ? `, ${markets.positions.length} positions` : ''}</small></div>
                    <span />
                    <span className={`r ${markets.book.direction === 'up' ? 'up-t' : 'dn-t'}`}>{markets.book.pct}</span>
                    <span className={`r ${markets.book.direction === 'up' ? 'up-t' : 'dn-t'}`}>{markets.book.dollars}</span>
                  </div>
                ) : null}
                <div id="t2-pos-list">
                  {markets.positions.map((p, i) => i < cfg.positions || allPos ? <Position key={`${p.ticker}-${p.detail}-${i}`} p={p} extra={i >= cfg.positions} /> : null)}
                </div>
                {markets.positions.length > cfg.positions ? (
                  <button type="button" className="t2-more" aria-expanded={allPos} aria-controls="t2-pos-list" onClick={() => { const v = !allPos; setAllPos(v); localStorage.setItem(POS_KEY, v ? '1' : '0'); }}>
                    <ChevronDown aria-hidden className={allPos ? 'up' : ''} />{allPos ? 'Show fewer' : `Show ${markets.positions.length - cfg.positions} more`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {unconnected.length ? (
        <p className="t2-nc">Not connected yet: {joinWords(unconnected)}. <Link className="hd-linkish t2-link" href="/t/settings#st-today">Your sources</Link></p>
      ) : null}

      <WeatherSheet open={wxOpen} onOpenChange={setWxOpen} city={prefs.city} deviceLocation={!!prefs.deviceLocation} coords={coords} locationNote={locationNote}
        onSaveCity={(city) => savePrefs({ city, deviceLocation: false })} onDevice={(deviceLocation) => savePrefs({ deviceLocation })} />
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

type Pos = MarketsSource['positions'][number];
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function Position({ p, extra }: { p: Pos; extra: boolean }) {
  return (
    <div className={`t2-ps num${extra ? ' t2-extra' : ''}`}>
      <div><b>{p.ticker}</b><small>{[p.detail || p.quantity, p.value != null ? `≈${usd0.format(p.value)}` : null].filter(Boolean).join(' · ')}</small></div>
      {p.sparkline ? (
        <svg viewBox="0 0 84 32" width="60" height="28" aria-hidden="true" preserveAspectRatio="none">
          {p.sparkline.priorY != null ? <line x1="4" x2="80" y1={p.sparkline.priorY} y2={p.sparkline.priorY} stroke="var(--text-3)" strokeDasharray="1.5 2.5" strokeWidth="1" /> : null}
          <polyline points={p.sparkline.points} fill="none" stroke={p.direction === 'up' ? 'var(--viz-ok)' : 'var(--viz-over)'} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : <span />}
      <span className={`r ${p.direction === 'up' ? 'up-t' : 'dn-t'}`}>{p.pct}</span>
      <span className={`r ${p.direction === 'up' ? 'up-t' : 'dn-t'}`}>{p.dollars}</span>
    </div>
  );
}

/** "Synced 7:42 PM" today, "Synced Oct 5, 12:14 PM" otherwise; exact time on hover; flagged past the threshold. */
function Synced({ at, now, staleHours }: { at: string | null; now: Date | null; staleHours: number }) {
  if (!at) return <span className="t2-sync">Not synced</span>;
  const d = new Date(at), n = now ?? new Date();
  const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) === new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(n);
  const label = sameDay ? clock(d) : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);
  const hrs = (n.getTime() - d.getTime()) / 3600000;
  const stale = hrs > staleHours;
  const ago = hrs < 1 ? `${Math.max(1, Math.round(hrs * 60))} min ago` : hrs < 48 ? `${Math.round(hrs)} h ago` : `${Math.round(hrs / 24)} days ago`;
  const exact = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(d) + ' PT';
  return (
    <time className={`t2-sync${stale ? ' stale' : ''}`} dateTime={at} title={`Holdings synced ${exact} (${ago})`}>
      {stale ? <CircleAlert aria-hidden /> : null}Synced {label} PT{stale ? <span className="hd-sr">, more than {staleHours} hours old</span> : null}
    </time>
  );
}

function Trends({ t, n }: { t: XTrends | null; n: number }) {
  const items = t?.items.slice(0, n) ?? [];
  return (
    <div className="t2-trends">
      <h3><svg viewBox="0 0 24 24" aria-hidden="true" className="t2-x"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5Z" fill="currentColor" /></svg>Trending</h3>
      {items.length ? (
        <ol className="t2-tr">
          {items.map((x, i) => {
            const body = <><b>{x.title}</b><span>{[x.context, x.posts].filter(Boolean).join(' · ')}</span></>;
            return <li key={i}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{body}</a> : <div>{body}</div>}</li>;
          })}
        </ol>
      ) : (
        <p className="t2-empty">{t?.status === 'error' ? t.note : 'No X trends yet. A local agent can write them to ~/.local/share/home-dashboard/x-trends.json.'}</p>
      )}
      {items.length && t?.updatedAt ? <p className={`t2-trmeta${t.stale ? ' stale' : ''}`}>{t.stale ? 'Stale · ' : ''}Updated {clock(t.updatedAt)} PT</p> : null}
    </div>
  );
}

/** "Your topics" sits above Headlines; edits happen in an inline popover and save to settings.json. */
function TopicsControl({ topics, onSave }: { topics: string; onSave: (t: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(topics);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const summary = topics.trim() ? topics.trim().replace(/\s+/g, ' ') : 'Choose topics';
  return (
    <Popover open={open} onOpenChange={(v) => { if (v) { setDraft(topics); setErr(''); } setOpen(v); }}>
      <PopoverTrigger asChild>
        <button type="button" className="t2-topics" aria-label={`Your topics: ${summary}. Edit`}>
          <SlidersHorizontal aria-hidden /><span className="t2-topics-l">Your topics</span><span className="t2-topics-v">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="hd-tokens t2-pop">
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); const r = await onSave(draft.trim()); setBusy(false); if (r) setErr(r); else setOpen(false); }}>
          <label htmlFor="t2-topics-in" className="t2-pop-h">Headline topics</label>
          <p className="t2-pop-help" id="t2-topics-help">Topics, publications and things to skip. Used to curate headlines.</p>
          <MicField value={draft} onChange={(v) => setDraft(v.slice(0, 500))} label="Dictate topics">
            <textarea id="t2-topics-in" autoFocus rows={3} value={draft} maxLength={500} aria-describedby="t2-topics-help" placeholder="AI, local news, space; skip celebrity gossip" onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
          </MicField>
          {err ? <p role="alert" className="t2-err">{err}</p> : null}
          <div className="t2-pop-f">
            <span className="hd-faint num">{draft.length}/500</span>
            <button type="button" className="hd-btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="hd-btn primary small" disabled={busy || draft.trim() === topics.trim()}>{busy ? 'Saving' : 'Save'}</button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
