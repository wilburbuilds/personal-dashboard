import { z } from 'zod';
import { validOrigin } from '@/lib/request-origin';
import { readRecord, saveRecord } from '@/lib/dashboard-store';
import { sourceSchema } from '@/lib/dashboard';
import {
  HEADLINES_CURATION_RECORD_ID,
  buildHeadlinesCurationRecord,
  isFreshHeadlinesCuration,
  pacificDayKey,
  readMorningBriefHeadlines,
} from '@/lib/headlines-curate.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

const putSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  mode: z.string().max(40).optional(),
  source: sourceSchema,
});

/** GET current headlines curation (vault + PUT record) and freshness. */
export async function GET() {
  try {
    const now = new Date();
    const record = (await readRecord(HEADLINES_CURATION_RECORD_ID)) as Record<string, unknown> | null;
    const vault = await readMorningBriefHeadlines(now);
    return Response.json(
      {
        vault: vault
          ? { day: vault.day, path: vault.path, itemCount: vault.items.length, source: vault.source }
          : null,
        record,
        freshVault: Boolean(vault?.items?.length),
        freshRecord: isFreshHeadlinesCuration(record, now),
        expectedDate: pacificDayKey(now),
        replaceRule:
          'When today’s Pacific vault brief exists and ## Headlines parses to ≥1 item, GET /api/dashboard replaces sources.headlines with the curated list. Else a fresh PUT /api/headlines-curation record (≥1 item, same Pacific day) replaces RSS. Otherwise RSS (lib/headlines.mjs) remains the floor.',
      },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Headlines curation could not be loaded.' }, { status: 503, headers });
  }
}

/**
 * PUT curated headlines source (secondary path when agents skip vault write).
 * Local automation may omit Origin (allowMissing).
 */
export async function PUT(request: Request) {
  if (!validOrigin(request, true)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  }
  try {
    const body = await request.text();
    if (body.length > 100000) {
      return Response.json({ error: 'Update too large' }, { status: 413, headers });
    }
    const parsed = putSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid headlines curation', details: parsed.error.flatten() },
        { status: 400, headers },
      );
    }
    const now = new Date();
    const record = buildHeadlinesCurationRecord({
      source: parsed.data.source,
      now,
      mode: parsed.data.mode || 'external',
      options: parsed.data.date ? { date: parsed.data.date } : {},
    });
    await saveRecord(HEADLINES_CURATION_RECORD_ID, record);
    return Response.json(
      { saved: true, date: record.date, fresh: isFreshHeadlinesCuration(record, now) },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Headlines curation could not be saved.' }, { status: 503, headers });
  }
}
