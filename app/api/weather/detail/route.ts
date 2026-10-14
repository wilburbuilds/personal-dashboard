import { readWeatherDetail } from '@/lib/weather-detail';
export const dynamic = 'force-dynamic';
/** GET only. Optional ?lat=&lon= (this device's location, rounded to ~1 km) instead of the saved city. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat')), lon = Number(u.searchParams.get('lon'));
  const coords = u.searchParams.has('lat') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100 } : undefined;
  return Response.json(await readWeatherDetail(new Date(), coords), { headers: { 'Cache-Control': 'private, no-store' } });
}
