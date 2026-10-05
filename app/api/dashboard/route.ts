import { readHeadlineSource } from '@/lib/headline-source';
import { readMarketsSource } from '@/lib/markets.mjs';
import { readWorkoutSource } from '@/lib/workout.mjs';
import { readWeatherSource } from '@/lib/weather';
import { readHealthSource } from '@/lib/health.mjs';
import { readCalendarSource } from '@/lib/calendar.mjs';
import { readGmailSources } from '@/lib/gmail.mjs';
import { applyOvernightCuration, CURATION_RECORD_ID } from '@/lib/overnight-curate.mjs';
import {
  applyHeadlinesCuration,
  HEADLINES_CURATION_RECORD_ID,
  readMorningBriefHeadlines,
} from '@/lib/headlines-curate.mjs';
import { homeRooms } from '@/lib/homekit.mjs';
import { validOrigin } from '@/lib/request-origin';
import { readRecord, saveRecord } from '@/lib/dashboard-store';
import { snapshotSchema, emptySnapshot, defaultPreferences } from '@/lib/dashboard';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  try {
    const snapshot = (await readRecord('snapshot')) ?? emptySnapshot();
    const preferences = (await readRecord('preferences')) ?? defaultPreferences;
    const [health, weather, headlinesRss, calendar, gmail, overnightCuration, headlinesCuration, vaultHeadlines, markets, workout] =
      await Promise.all([
        readHealthSource(),
        readWeatherSource(preferences.city),
        readHeadlineSource(),
        readCalendarSource(),
        readGmailSources(),
        readRecord(CURATION_RECORD_ID),
        readRecord(HEADLINES_CURATION_RECORD_ID),
        readMorningBriefHeadlines(),
        readMarketsSource(),
        readWorkoutSource(),
      ]);
    snapshot.sources.health = health;
    snapshot.sources.weather = weather;
    snapshot.sources.headlines = applyHeadlinesCuration(
      headlinesRss ?? {
        status: 'error',
        updatedAt: null,
        note: 'Headlines unavailable.',
        items: [],
      },
      {
        vault: vaultHeadlines,
        record: headlinesCuration,
      },
    );
    snapshot.sources.calendar = calendar;
    snapshot.sources.overnight = applyOvernightCuration(gmail.overnight, overnightCuration);
    snapshot.sources.followups = gmail.followups;
    const rooms = homeRooms();
    if (rooms.length) {
      snapshot.sources.home = {
        status: rooms.some((r) => r.stale) ? 'error' : 'ready',
        updatedAt: rooms.map((r) => r.observedAt).sort().at(-1),
        note: rooms.some((r) => r.stale)
          ? 'Some room readings are more than an hour old.'
          : 'HomePod sensors · saved on your Mac mini',
        items: [],
      };
    } else
      snapshot.sources.home = {
        status: 'unconnected',
        updatedAt: null,
        note: 'Receiver ready. Waiting for your first HomePod reading.',
        items: [],
      };
    return Response.json({ snapshot, homeRooms: rooms, preferences, markets, workout }, { headers });
  } catch {
    return Response.json(
      { error: 'Your dashboard could not be loaded. Try again shortly.' },
      { status: 503, headers },
    );
  }
}
// The production server binds to localhost and validates Host and Origin.
// Local automation may write without a browser Origin header.
export async function PUT(request: Request) {
  if (!validOrigin(request, true))
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 100000)
      return Response.json({ error: 'Update too large' }, { status: 413, headers });
    const parsed = snapshotSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        { error: 'Invalid dashboard snapshot', details: parsed.error.flatten() },
        { status: 400, headers },
      );
    await saveRecord('snapshot', parsed.data);
    return Response.json({ saved: true, date: parsed.data.date }, { headers });
  } catch {
    return Response.json({ error: 'Update could not be saved.' }, { status: 503, headers });
  }
}
