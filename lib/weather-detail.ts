import { readRecord, saveRecord } from './dashboard-store';
import { isDemo, demoWeatherDetail } from '@/lib/demo/fixtures.mjs';

export type Cond = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm';
export type WeatherDetail = {
  status: 'ready' | 'unconnected' | 'error';
  note?: string;
  location: string; unit: 'F'; updatedAt: string | null;
  now: { temp: number; feelsLike: number; wind: number; gust: number; windDir: string; humidity: number; uv: number; condition: Cond } | null;
  today: { high: number; low: number; precipChance: number; precipSum: number; sunrise: string; sunset: string; uvMax: number } | null;
  hours: { time: string; temp: number; precip: number }[];
  days: { date: string; high: number; low: number; precipChance: number; condition: Cond }[];
};

const TZ = 'America/Los_Angeles';
const empty = (status: WeatherDetail['status'], note: string): WeatherDetail => ({ status, note, location: '', unit: 'F', updatedAt: null, now: null, today: null, hours: [], days: [] });
export const condition = (code: number): Cond => code >= 95 ? 'storm' : [71, 73, 75, 77, 85, 86].includes(code) ? 'snow' : code >= 51 ? 'rain' : code >= 2 ? 'cloud' : 'sun';
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

type Place = { latitude: number; longitude: number; name: string; admin1?: string; country?: string };

/**
 * Today's detail and a 7-day forecast from Open-Meteo (free, no key), for the place the
 * Today card already resolved (saved in the weather-cache record). Cached for 20 minutes.
 */
export async function readWeatherDetail(now = new Date()): Promise<WeatherDetail> {
  if (isDemo()) return demoWeatherDetail(now);
  const saved = (await readRecord('weather-cache')) as { key: string; place?: Place } | null;
  const place = saved?.place;
  if (!place) return empty('unconnected', 'Choose a weather location first.');
  const cached = (await readRecord('weather-detail-cache')) as { key: string; at: number; detail: WeatherDetail } | null;
  if (cached?.key === saved!.key && now.getTime() - cached.at < 20 * 60000) return cached.detail;
  const q = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,weather_code',
    hourly: 'temperature_2m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: TZ, forecast_days: '7',
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) throw new Error('Open-Meteo ' + res.status);
    const f = await res.json();
    const c = f.current, d = f.daily, h = f.hourly;
    const day = d.time[0] as string;
    const r = (n: number) => Math.round(n);
    const detail: WeatherDetail = {
      status: 'ready', location: [place.name, place.admin1].filter(Boolean).join(', '), unit: 'F', updatedAt: now.toISOString(),
      now: { temp: r(c.temperature_2m), feelsLike: r(c.apparent_temperature), wind: r(c.wind_speed_10m), gust: r(c.wind_gusts_10m), windDir: compass(c.wind_direction_10m), humidity: r(c.relative_humidity_2m), uv: Math.round(c.uv_index * 10) / 10, condition: condition(c.weather_code) },
      today: { high: r(d.temperature_2m_max[0]), low: r(d.temperature_2m_min[0]), precipChance: r(d.precipitation_probability_max[0] ?? 0), precipSum: d.precipitation_sum[0] ?? 0, sunrise: d.sunrise[0], sunset: d.sunset[0], uvMax: Math.round((d.uv_index_max[0] ?? 0) * 10) / 10 },
      hours: (h.time as string[]).map((t, i) => ({ time: t, temp: r(h.temperature_2m[i]), precip: r(h.precipitation_probability[i] ?? 0) })).filter((x) => x.time.startsWith(day)),
      days: (d.time as string[]).map((t, i) => ({ date: t, high: r(d.temperature_2m_max[i]), low: r(d.temperature_2m_min[i]), precipChance: r(d.precipitation_probability_max[i] ?? 0), condition: condition(d.weather_code[i]) })),
    };
    await saveRecord('weather-detail-cache', { key: saved!.key, at: now.getTime(), detail });
    return detail;
  } catch {
    if (cached?.detail) return { ...cached.detail, status: 'error', note: 'Couldn’t refresh. Showing the last forecast.' };
    return empty('error', 'Weather detail is unavailable right now.');
  }
}
