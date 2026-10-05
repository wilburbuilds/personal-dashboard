'use client';
import { useEffect,useState,useRef } from 'react';
import { Sun,Cloud,CloudRain,CloudSnow,CloudLightning,Moon,Heart,CalendarDays,Bell,MessageCircle,Newspaper,House,Workflow,Radio,Settings2,RefreshCw,LockKeyhole,Plus,Activity,Footprints,Wind,Clock3,TrendingUp,Dumbbell } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { emptySnapshot,defaultPreferences,keys,type Snapshot,type Preferences } from '@/lib/dashboard';
import type { MarketsSource } from '@/lib/markets.mjs';
import type { WorkoutSource } from '@/lib/workout.mjs';

const titles={weather:'Weather',health:'Your health',calendar:'The day ahead',overnight:'While you were away',followups:'A little nudge',headlines:'On your radar',automations:'Scheduled tasks',discord:'Discord',home:'At home'};
const icons={weather:Sun,health:Heart,calendar:CalendarDays,overnight:Bell,followups:MessageCircle,headlines:Newspaper,automations:Workflow,discord:Radio,home:House};
type Key=typeof keys[number];
type Room={room:string;temperatureC:number|null;humidityPercent:number|null;observedAt:string;stale:boolean;history:{time:string;value:number}[]};

const emptyMarkets:MarketsSource={status:'unconnected',updatedAt:null,strip:[],book:null,positions:[],note:'Markets not loaded yet.'};
const emptyWorkout:WorkoutSource={status:'unconnected',updatedAt:null,weekday:'',title:null,meta:null,exercises:[],note:'Workout not loaded yet.'};

function sourceStamp(status:string,updatedAt:string|null|undefined,loading:boolean,checked:string){
  if(loading&&!checked)return 'Loading';
  if(status==='unconnected')return 'Not connected';
  if(status==='error')return 'Needs attention';
  if(!updatedAt||Date.now()-Date.parse(updatedAt)>36*3600000)return 'Out of date';
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(updatedAt));
}

export default function Dashboard(){
  const useDevice=useRef(false);
  const [locationNote,setLocationNote]=useState('');
  const [rooms,setRooms]=useState<Room[]>([]);
  const [data,setData]=useState<Snapshot>(emptySnapshot);
  const [prefs,setPrefs]=useState<Preferences>(defaultPreferences);
  const [draft,setDraft]=useState<Preferences>(defaultPreferences);
  const [markets,setMarkets]=useState<MarketsSource>(emptyMarkets);
  const [workout,setWorkout]=useState<WorkoutSource>(emptyWorkout);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [checked,setChecked]=useState('');

  async function refresh(){
    setLoading(true);setError('');
    try{
      const res=await fetch('/api/dashboard',{cache:'no-store'});
      const json=await res.json() as {snapshot:Snapshot;preferences:Preferences;homeRooms?:Room[];markets?:MarketsSource;workout?:WorkoutSource;error?:string};
      if(!res.ok)throw Error(json.error);
      if(useDevice.current){
        try{
          const position=await new Promise<GeolocationPosition>((resolve,reject)=>{
            if(!navigator.geolocation)return reject(Error('Unavailable'));
            navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:10000,maximumAge:300000,enableHighAccuracy:false});
          });
          const wr=await fetch('/api/weather',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:position.coords.latitude,longitude:position.coords.longitude})});
          if(!wr.ok)throw Error('Weather unavailable');
          const ws=await wr.json();
          if(!ws.weather)throw Error('Weather unavailable');
          json.snapshot.sources.weather=ws;
          setLocationNote('Using this device’s location while the dashboard is open.');
        }catch{
          setLocationNote('Location unavailable. Showing your saved city.');
        }
      }
      setData(json.snapshot);
      setRooms(json.homeRooms||[]);
      setPrefs(json.preferences);
      setMarkets(json.markets||emptyMarkets);
      setWorkout(json.workout||emptyWorkout);
      setChecked(new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date()));
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load your dashboard.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    useDevice.current=localStorage.getItem('weather-use-device')==='true';
    refresh();
    const timer=setInterval(()=>{if(!document.hidden)refresh();},60000);
    return ()=>clearInterval(timer);
  },[]);

  async function save(e:React.FormEvent){
    e.preventDefault();setSaving(true);setSaveError('');
    try{
      const r=await fetch('/api/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const j=await r.json() as {error?:string};
      if(!r.ok)throw Error(j.error);
      setPrefs(draft);useDevice.current=false;localStorage.removeItem('weather-use-device');setLocationNote('');setOpen(false);refresh();
    }catch(e){
      setSaveError(e instanceof Error?e.message:'Unable to save.');
    }finally{
      setSaving(false);
    }
  }

  const today=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'America/Los_Angeles'}).format(new Date());
  const ready=keys.filter(k=>data.sources[k]?.status==='ready').length;
  const weather=data.sources.weather?.weather;
  const WeatherIcon=weather?({sun:Sun,cloud:Cloud,rain:CloudRain,snow:CloudSnow,storm:CloudLightning}[weather.condition]):Sun;

  function status(k:Key){
    const s=data.sources[k];
    if(loading&&!checked)return 'Loading';
    if(!s||s.status==='unconnected')return 'Not connected';
    if(s.status==='error')return 'Needs attention';
    if(!s.updatedAt||Date.now()-Date.parse(s.updatedAt)>36*3600000)return 'Out of date';
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(s.updatedAt));
  }

  function contents(k:Key){
    const s=data.sources[k];
    if(k==='home')return <><div className="rooms">{rooms.map(r=>{
      const values=r.history.map(p=>p.value);
      const low=Math.min(...values),range=Math.max(...values)-low||1;
      const points=values.map((v,i)=>`${i/(values.length-1||1)*240},${40-(v-low)/range*32}`).join(' ');
      return <div className="room" key={r.room}><h3>{r.room}</h3><div className="room-values"><strong>{r.temperatureC===null?'—':Math.round(r.temperatureC*9/5+32)+'°F'}</strong><span>{r.humidityPercent===null?'':Math.round(r.humidityPercent)+'% humidity'}</span></div>{values.length>1&&<svg viewBox="0 0 240 48" role="img" aria-label={`${r.room} temperature trend over the last 24 hours`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5"/></svg>}<small>{r.stale?'Stale · ':''}{new Date(r.observedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'})} PT{values.length>1?' · 24h trend':''}</small></div>;
    })}</div>{!rooms.length&&<p className="muted">{s?.note}</p>}<a className="homekit-link" href="/homekit">{rooms.length?'HomePod setup':'Connect HomePod sensors'}</a></>;
    return <>{s?.items?.length?<div className="items">{s.items.map((it,i)=><div className="item" key={i}>{k==='calendar'&&<time>{it.time||'Today'}</time>}<div>{it.label&&<span className="eyebrow">{it.label}</span>}{it.url?<a className="item-title" href={it.url} target="_blank" rel="noreferrer">{it.title}</a>:<h3>{it.title}</h3>}{it.detail&&<p>{it.detail}</p>}</div></div>)}</div>:<div className="empty-copy"><p>{s?.note||'No data yet.'}</p>{s?.status==='ready'&&<span>Nothing to show in this update.</span>}</div>}{s?.updatedAt&&<small className="source-note">{s.note}</small>}</>;
  }

  function card(k:Key,extra=''){
    const Icon=icons[k];
    return <section className={'card '+extra} key={k}><div className="card-head"><h2><Icon size={19}/>{titles[k]}</h2><span className={'stamp '+(data.sources[k]?.status==='error'?'attention':'')}>{status(k)}</span></div>{contents(k)}</section>;
  }

  return <main>
    <header className="topbar">
      <a href="/" className="wordmark"><span className="brand-mark"><Sun size={23}/></span>today<span className="wordmark-dot">.</span></a>
      <div className="top-actions">
        <span className="private"><LockKeyhole size={14}/>Just for you</span>
        <Button variant="ghost" className="icon-button" onClick={refresh} disabled={loading} aria-label="Reload saved dashboard"><RefreshCw size={19} className={loading?'spin':''}/></Button>
        <Dialog open={open} onOpenChange={v=>{if(v)setDraft(prefs);setOpen(v);}}>
          <DialogTrigger asChild><Button variant="ghost" className="icon-button" aria-label="Dashboard preferences"><Settings2 size={20}/></Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Make it yours</DialogTitle>
              <DialogDescription>These preferences guide your daily updates. Account connections are set up with Codex.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="settings-form">
              <label>Weather location<input value={draft.city} maxLength={150} placeholder="City, state or country" onChange={e=>setDraft({...draft,city:e.target.value})}/></label>
              <label>Headlines you care about<textarea value={draft.topics} maxLength={500} placeholder="Topics, publications, things to skip…" onChange={e=>setDraft({...draft,topics:e.target.value})}/></label>
              <label>Your personal sources<textarea value={draft.sourceNotes} maxLength={2000} placeholder="Health app, calendar, Discord channels, Home Assistant… No passwords or tokens." onChange={e=>setDraft({...draft,sourceNotes:e.target.value})}/></label>
              {saveError&&<p role="alert">{saveError}</p>}
              <Button type="submit" disabled={saving}>{saving?'Saving…':'Save preferences'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </header>

    <div className="greeting">
      <div><p className="date">{today}</p><h1>Your day, at a glance.</h1></div>
      <div className="edition"><span>YOUR DAILY BRIEF</span><p>{checked?`Last checked ${checked} PT`:'Getting your dashboard ready'}</p></div>
    </div>

    {error&&<div className="notice error" role="alert">{error} {checked?'Previously loaded information is still shown.':''}<button onClick={refresh}>Try again</button></div>}
    {ready===0&&<div className="notice"><span><strong>A fresh start.</strong> Your personal sources are waiting to be connected.</span><button onClick={()=>setOpen(true)}>Set your preferences <Plus size={16}/></button></div>}

    <section className="card markets-strip" aria-label="Market figures">
      <div className="card-head">
        <h2><TrendingUp size={19}/>Markets</h2>
        <span className={'stamp '+(markets.status==='error'?'attention':'')}>{sourceStamp(markets.status,markets.updatedAt,loading,checked)}</span>
      </div>
      {markets.strip.length?(
        <div className="quote-strip">
          {markets.strip.map(q=>(
            <p className="quote" key={q.symbol}>
              <span className="sym">{q.symbol}</span>
              <span className="num">{q.value}</span>
              <span className={'chg '+q.direction}>{q.change}</span>
            </p>
          ))}
        </div>
      ):(
        <p className="muted">{markets.note}</p>
      )}
    </section>

    <div className="vitals">
      <section className="weather-card">
        <div className="card-head"><h2>{weather?.location||prefs.city||'Your weather'}</h2><span className="stamp">{status('weather')}</span></div>
        <div className="weather-main"><WeatherIcon strokeWidth={1.35} aria-hidden="true"/><div><div className="temperatures">{weather?`${weather.high}°`:'—°'}<span>/ {weather?`${weather.low}°`:'—°'}</span></div><p>{weather?`${weather.location} · °${weather.unit}`:'High / low'}</p></div></div>
        <p className="weather-note">{data.sources.weather?.note}</p>
        <div className="weather-controls">
          <button disabled={loading} onClick={()=>{useDevice.current=true;localStorage.setItem('weather-use-device','true');refresh();}}>Use my location</button>
          <button onClick={()=>{useDevice.current=false;localStorage.removeItem('weather-use-device');setLocationNote('');setDraft(prefs);setOpen(true);refresh();}}>Choose city</button>
        </div>
        {locationNote&&<p className="source-note" role="status">{locationNote}</p>}
        <a className="source-note" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo</a>
      </section>
      <section className="card health">
        <div className="card-head"><h2><Heart size={19}/>Your health</h2><span className="stamp">{status('health')}</span></div>
        <div className="health-metrics">{(data.sources.health?.metrics?.length?data.sources.health.metrics:[{label:'Sleep',value:'—'},{label:'Resting heart rate',value:'—'},{label:'Movement',value:'—'}]).map((m,i)=>{const I=[Moon,Activity,Footprints,Wind][i%4];return <div className="metric" key={m.label}><I size={23}/><strong>{m.value}<small>{m.unit}</small></strong><span>{m.label}</span></div>;})}</div>
        {contents('health')}
      </section>
    </div>

    <div className="markets-workout-grid">
      <section className="card positions-card" aria-label="Positions">
        <div className="card-head">
          <h2><TrendingUp size={19}/>Positions</h2>
          <span className={'stamp '+(markets.status==='error'?'attention':'')}>{sourceStamp(markets.status,markets.updatedAt,loading,checked)}</span>
        </div>
        {markets.book&&(
          <div className={'day-header '+markets.book.direction} aria-label="Today book P/L">
            <div className="day-meta">
              <span className="day-kicker">{markets.book.label}</span>
              <span className="day-sub">{markets.book.sub}</span>
            </div>
            <div className="day-pnl">
              <span className="pct">{markets.book.pct}</span>
              <span className="dollars">{markets.book.dollars}</span>
            </div>
          </div>
        )}
        {markets.positions.length?(
          <ul className="pos-list">
            {markets.positions.map((p,i)=>(
              <li className={'pos '+p.direction} key={`${p.ticker}-${p.detail||p.quantity}-${i}`}>
                <div className="pos-meta">
                  <span className="ticker">{p.ticker}</span>
                  {p.detail&&<span className="opt">{p.detail}</span>}
                  <span className="shares">{p.quantity}</span>
                </div>
                {p.sparkline?(
                  <svg className="spark" viewBox="0 0 84 32" width="84" height="32" aria-hidden="true" focusable="false">
                    {p.sparkline.priorY!=null&&(
                      <line
                        className="prior-close"
                        x1="4"
                        y1={p.sparkline.priorY}
                        x2="80"
                        y2={p.sparkline.priorY}
                        stroke="#c8ced6"
                        strokeDasharray="1.5 2.5"
                        strokeWidth="1"
                        fill="none"
                      />
                    )}
                    <polyline
                      className="path"
                      points={p.sparkline.points}
                      fill="none"
                      stroke={p.sparkline.color || (p.direction==='up'?'#5ac53a':'#eb5d2a')}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ):<span className="spark-gap" aria-hidden="true"/>}
                <div className="pnl">
                  <span className="pct">{p.pct}</span>
                  <span className="dollars">{p.dollars}</span>
                </div>
              </li>
            ))}
          </ul>
        ):(
          <div className="empty-copy"><p>{markets.note}</p></div>
        )}
        {markets.updatedAt&&markets.positions.length>0&&<small className="source-note">{markets.note}</small>}
      </section>

      <section className="card workout-card" aria-label="Workout">
        <div className="card-head">
          <h2><Dumbbell size={19}/>Workout</h2>
          <span className={'stamp '+(workout.status==='error'?'attention':'')}>{sourceStamp(workout.status,workout.updatedAt,loading,checked)}</span>
        </div>
        {workout.title?(
          <>
            <p className="session">{workout.title}</p>
            {workout.meta&&<p className="workout-meta">{workout.meta}</p>}
            {workout.exercises.length?(
              <ul className="workout-list">
                {workout.exercises.map((ex)=><li key={ex}>{ex}</li>)}
              </ul>
            ):null}
          </>
        ):(
          <div className="empty-copy"><p>{workout.note}</p></div>
        )}
        {workout.updatedAt&&<small className="source-note">{workout.note}</small>}
      </section>
    </div>

    <div className="main-grid">
      <div className="agenda-column">
        <section className="card agenda">
          <div className="card-head"><h2><CalendarDays size={19}/>The day ahead</h2><span className="stamp">{status('calendar')}</span></div>
          {data.sources.calendar?.items?.length?contents('calendar'):<div className="agenda-empty"><Clock3 size={40} strokeWidth={1}/><h3>Your time, in one place.</h3><p>{data.sources.calendar?.note}</p><div className="time-track" aria-hidden="true"><span>Morning</span><i/><span>Afternoon</span><i/><span>Evening</span></div></div>}
        </section>
        {card('followups','nudges')}
      </div>
      <div className="brief-column">{card('overnight','overnight')}{card('headlines','headlines')}</div>
    </div>

    <div className="section-label"><span>IN THE BACKGROUND</span><span>Home, communities & routines</span></div>
    <div className="background-grid">{card('home')}{card('discord')}{card('automations')}</div>
    <footer><span><LockKeyhole size={13}/>Personal dashboard · Pacific time</span><span>{ready} of {keys.length} sources reporting</span></footer>
  </main>;
}
