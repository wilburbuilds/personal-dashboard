import { z } from 'zod';
import { validOrigin } from '@/lib/request-origin';
import { readRecord, saveRecord } from '@/lib/dashboard-store';
import { sourceSchema } from '@/lib/dashboard';
import {
  CURATION_RECORD_ID,
  buildCurationRecord,
  curationDayKey,
  isFreshCuration,
} from '@/lib/overnight-curate.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

const putSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  mode: z.string().max(40).optional(),
  candidateCount: z.number().int().min(0).max(500).optional(),
  source: sourceSchema,
});

/** GET current curation record (and whether it would replace overnight today). */
export async function GET() {
  try {
    const record = (await readRecord(CURATION_RECORD_ID)) as Record<string, unknown> | null;
    const now = new Date();
    return Response.json(
      {
        record,
        fresh: isFreshCuration(record, now),
        expectedDate: curationDayKey(now),
        replaceRule:
          'When fresh (same Pacific day as overnight end), GET /api/dashboard replaces sources.overnight with this curated source. Raw Gmail overnight remains the floor when curation is missing or stale.',
      },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Curation could not be loaded.' }, { status: 503, headers });
  }
}

/**
 * PUT curated overnight source. For Grok Bot routines or local scripts.
 * Never modifies Gmail. Local automation may omit Origin (allowMissing).
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
        { error: 'Invalid overnight curation', details: parsed.error.flatten() },
        { status: 400, headers },
      );
    }
    const now = new Date();
    const record = buildCurationRecord({
      source: parsed.data.source,
      now,
      mode: parsed.data.mode || 'external',
      candidateCount: parsed.data.candidateCount ?? parsed.data.source.items.length,
      keptCount: parsed.data.source.items.length,
    });
    if (parsed.data.date) record.date = parsed.data.date;
    await saveRecord(CURATION_RECORD_ID, record);
    return Response.json(
      { saved: true, date: record.date, fresh: isFreshCuration(record, now) },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Curation could not be saved.' }, { status: 503, headers });
  }
}
