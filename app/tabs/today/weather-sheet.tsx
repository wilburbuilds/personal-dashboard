'use client';
import { useEffect, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Wind, Thermometer, Sunrise, Sunset, Droplets, MapPin, Pencil, CircleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { WeatherDetail, Cond } from '@/lib/weather-detail';
import { MicField } from '@/components/home/mic';

const TZ = 'America/Los_Angeles';
const WX: Record<Cond, typeof Sun> = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const WORD: Record<Cond, string> = { sun: 'Clear', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Storms' };
/** Open-Meteo local times have no offset ("2026-10-13T07:21"); they are already Pacific. */
const hm = (t: string) => { const [h, m] = t.slice(11, 16).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hr = (t: string) => { const h = Number(t.slice(11, 13)); return h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`; };
const dow = (d: string, i: number) => i === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const uvWord = (u: number) => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';

type Coords = { latitude: number; longitude: number } | null;
type LocProps = { city: string; deviceLocation: boolean; coords: Coords; locationNote: string; onSaveCity: (city: string) => Promise<string | null>; onDevice: (on: boolean) => Promise<string | null> };

export function WeatherSheet({ open, onOpenChange, city, deviceLocation, coords, locationNote, onSaveCity, onDevice }: { open: boolean; onOpenChange: (v: boolean) => void } & LocProps) {
  const [d, setD] = useState<WeatherDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const qs = deviceLocation && coords ? `?lat=${coords.latitude.toFixed(2)}&lon=${coords.longitude.toFixed(2)}` : '';
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch('/api/weather/detail' + qs, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (live) { setD(j); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, qs, city]);
  const Icon = d?.now ? WX[d.now.condition] : Cloud;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hd-tokens t2-dialog wx-sheet">
        <DialogHeader>
          <DialogTitle className="wx-title"><Icon aria-hidden className="wx-ic" />{d?.location || 'Weather'}</DialogTitle>
          <DialogDescription>{d?.now ? `${WORD[d.now.condition]} now · ${d.now.temp}°, feels like ${d.now.feelsLike}°` : failed ? 'Weather detail is unavailable right now.' : d?.note || 'Loading today’s forecast…'}</DialogDescription>
        </DialogHeader>
        {d?.status === 'error' && d.note ? <p className="t2-note wx-note"><CircleAlert aria-hidden />{d.note}</p> : null}
        {!d && !failed ? <div className="wx-skel"><span className="hd-skel" style={{ height: 150 }} /><span className="hd-skel" style={{ height: 64 }} /></div> : null}
        {d?.now && d.today ? (
          <>
            <dl className="wx-facts num">
              <Fact icon={<Thermometer aria-hidden />} k="High / low" v={`${d.today.high}° / ${d.today.low}°`} />
              <Fact icon={<Wind aria-hidden />} k="Wind" v={`${d.now.wind} mph ${d.now.windDir}`} sub={d.now.gust > d.now.wind + 4 ? `Gusts ${d.now.gust}` : undefined} />
              <Fact icon={<Droplets aria-hidden />} k="Rain" v={`${d.today.precipChance}%`} sub={d.today.precipSum ? `${d.today.precipSum.toFixed(2)} in` : 'None expected'} />
              <Fact icon={<Sun aria-hidden />} k="UV index" v={`${d.today.uvMax}`} sub={uvWord(d.today.uvMax)} />
              <Fact icon={<Sunrise aria-hidden />} k="Sunrise" v={hm(d.today.sunrise)} />
              <Fact icon={<Sunset aria-hidden />} k="Sunset" v={hm(d.today.sunset)} />
            </dl>
            <HourChart hours={d.hours} />
            <h3 className="wx-h">7 days</h3>
            <WeekList days={d.days} />
          </>
        ) : null}
        <div className="wx-foot">
          <LocationEditor city={city} deviceLocation={deviceLocation} coords={coords} locationNote={locationNote} onSaveCity={onSaveCity} onDevice={onDevice} />
          <a className="t2-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo</a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ icon, k, v, sub }: { icon: React.ReactNode; k: string; v: string; sub?: string }) {
  return <div className="wx-fact">{icon}<dt>{k}</dt><dd>{v}{sub ? <small>{sub}</small> : null}</dd></div>;
}

function HourChart({ hours }: { hours: WeatherDetail['hours'] }) {
  if (hours.length < 2) return null;
  const W = 560, H = 150, top = 22, bottom = 26, left = 4, right = 4;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps) - 2, hi = Math.max(...temps) + 2;
  const x = (i: number) => left + (i / (hours.length - 1)) * (W - left - right);
  const y = (t: number) => top + (1 - (t - lo) / (hi - lo || 1)) * (H - top - bottom - 18);
  const line = hours.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`).join('');
  const area = `${line}L${x(hours.length - 1).toFixed(1)},${H - bottom}L${x(0).toFixed(1)},${H - bottom}Z`;
  const nowH = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
  const ni = hours.findIndex((h) => Number(h.time.slice(11, 13)) === nowH);
  const iMax = temps.indexOf(Math.max(...temps)), iMin = temps.indexOf(Math.min(...temps));
  const bw = (W - left - right) / hours.length - 3;
  const label = `Hourly forecast: ${Math.min(...temps)}° to ${Math.max(...temps)}°, rain chance up to ${Math.max(...hours.map((h) => h.precip))}%.`;
  return (
    <figure className="wx-chart">
      <figcaption><span><i className="sw t" />Temperature</span><span><i className="sw p" />Chance of rain</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        <defs><linearGradient id="wxg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--viz-1)" stopOpacity=".28" /><stop offset="1" stopColor="var(--viz-1)" stopOpacity="0" /></linearGradient></defs>
        {hours.map((h, i) => h.precip > 0 ? <rect key={i} className="wx-bar" x={x(i) - bw / 2} width={bw} y={H - bottom - (h.precip / 100) * 46} height={(h.precip / 100) * 46} rx="1.5"><title>{`${hr(h.time)}: ${h.precip}% rain`}</title></rect> : null)}
        <path d={area} fill="url(#wxg)" />
        <path d={line} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {ni >= 0 ? <><line x1={x(ni)} x2={x(ni)} y1={top - 8} y2={H - bottom} className="wx-now" vectorEffect="non-scaling-stroke" /><circle cx={x(ni)} cy={y(hours[ni].temp)} r="3.5" className="wx-dot" /></> : null}
        {[iMax, iMin].map((i, k) => <text key={k} x={Math.min(Math.max(x(i), 16), W - 16)} y={y(hours[i].temp) + (k ? 16 : -8)} className="wx-tl" textAnchor="middle">{hours[i].temp}°</text>)}
        {hours.map((h, i) => i % 3 === 0 ? <text key={i} x={x(i)} y={H - 8} className="wx-xl" textAnchor={i === 0 ? 'start' : 'middle'}>{hr(h.time)}</text> : null)}
      </svg>
    </figure>
  );
}

function WeekList({ days }: { days: WeatherDetail['days'] }) {
  const lo = Math.min(...days.map((d) => d.low)), hi = Math.max(...days.map((d) => d.high));
  const pct = (t: number) => ((t - lo) / (hi - lo || 1)) * 100;
  return (
    <ol className="wx-week num">
      {days.map((d, i) => {
        const I = WX[d.condition];
        return (
          <li key={d.date}>
            <span className="d">{dow(d.date, i)}</span>
            <span className="c" title={WORD[d.condition]}><I aria-hidden /><small>{d.precipChance >= 20 ? `${d.precipChance}%` : ''}</small></span>
            <span className="lo">{d.low}°</span>
            <span className="rng" aria-hidden><i style={{ left: `${pct(d.low)}%`, right: `${100 - pct(d.high)}%` }} /></span>
            <span className="hi">{d.high}°</span>
            <span className="hd-sr">{WORD[d.condition]}, {d.precipChance}% chance of rain</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Weather location, edited in place. Saved to the server settings (prefs.city / prefs.deviceLocation). */
function LocationEditor({ city, deviceLocation, locationNote, onSaveCity, onDevice }: LocProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(city);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<string | null>) => { setBusy(true); setErr(''); const e = await f(); setBusy(false); if (e) setErr(e); else setEditing(false); };
  if (!editing) {
    return (
      <div className="wx-loc">
        <MapPin aria-hidden className="hd-i" />
        <span>{deviceLocation ? 'This device’s location' : city || 'No location set'}</span>
        <button type="button" className="hd-btn ghost small" onClick={() => { setDraft(city); setEditing(true); }}><Pencil aria-hidden className="hd-i" />Change</button>
        {locationNote ? <span className="hd-faint wx-locnote" role="status">{locationNote}</span> : null}
      </div>
    );
  }
  return (
    <form className="wx-locform" onSubmit={(e) => { e.preventDefault(); run(() => onSaveCity(draft.trim())); }}>
      <label htmlFor="wx-city" className="hd-sr">Weather location</label>
      <MicField value={draft} onChange={(v) => setDraft(v.slice(0, 150))} label="Dictate location">
        <input id="wx-city" autoFocus value={draft} maxLength={150} placeholder="City, state or country" onChange={(e) => setDraft(e.target.value)} />
      </MicField>
      <button type="submit" className="hd-btn primary small" disabled={busy || !draft.trim()}>{busy ? 'Saving' : 'Save'}</button>
      <button type="button" className="hd-btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
      <button type="button" className="hd-btn small" disabled={busy} aria-pressed={deviceLocation} onClick={() => run(() => onDevice(!deviceLocation))}>
        <MapPin aria-hidden className="hd-i" />{deviceLocation ? 'Stop using this device’s location' : 'Use this device’s location'}
      </button>
      {err ? <p role="alert" className="t2-err">{err}</p> : null}
    </form>
  );
}
