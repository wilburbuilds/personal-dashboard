import { readRecord, saveRecord } from './dashboard-store';
import type { Snapshot } from './dashboard';
type Source = Snapshot['sources']['weather'];
async function get(url: string) {
  const response = await fetch(url, {signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!response.ok) throw Error('Weather source unavailable');
  return response.json();
}
export async function readWeatherSource(city: string): Promise<Source> {
  const key=city.trim().toLowerCase();
  if(!key) return {status:'unconnected',updatedAt:null,items:[],note:'Choose your weather location in preferences.'};
  const saved=await readRecord('weather-cache');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());
  const previous=saved?.key===key?saved:null;
  if(previous?.day===today && Date.now()-Date.parse(previous.source.updatedAt)<30*60000) return previous.source;
  try {
    let place=previous?.place;
    if(!place){
      const [name,...qualifiers]=key.split(',').map(v=>v.trim()).filter(Boolean);
      const geo=await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=100&language=en&format=json`);
      const matches=(geo.results??[]).filter((p:Record<string,unknown>)=>String(p.name).toLowerCase()===name && qualifiers.every(q=>[p.admin1,p.country,p.country_code].some(v=>String(v).toLowerCase()===q)));
      if(matches.length!==1) throw Error('Choose an unambiguous city, state or country in preferences.');
      place=matches[0];
    }
    const forecast=await get(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=1`);
    const daily=forecast.daily;
    const high=daily?.temperature_2m_max?.[0],low=daily?.temperature_2m_min?.[0],code=daily?.weather_code?.[0];
    if(daily?.time?.[0]!==today || ![high,low,code].every(Number.isFinite)) throw Error('Forecast incomplete');
    const condition=code>=95?'storm':[71,73,75,77,85,86].includes(code)?'snow':code>=51?'rain':code>=2?'cloud':'sun';
    const description={storm:'Thunderstorms',snow:'Snow',rain:'Rain or drizzle',cloud:'Cloudy or foggy',sun:'Clear or mostly clear'}[condition];
    const source:Source={status:'ready',updatedAt:new Date().toISOString(),items:[],note:`${description} · Today’s forecast · Open-Meteo`,weather:{condition,high:Math.round(high),low:Math.round(low),unit:'F',location:[place.name,place.admin1].filter(Boolean).join(', ')}};
    await saveRecord('weather-cache',{key,day:today,place,source});
    return source;
  }catch {
    if(previous?.day===today) return {...previous.source,status:'error',note:'Weather refresh unavailable. Showing the last saved forecast for today · Open-Meteo.'};
    return {status:'error',updatedAt:null,items:[],note:'Weather unavailable. Check the connection and use city, state or country in preferences.'};
  }
}
