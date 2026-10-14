import { readWeatherDetail } from '@/lib/weather-detail';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(await readWeatherDetail(), { headers: { 'Cache-Control': 'private, no-store' } });
}
