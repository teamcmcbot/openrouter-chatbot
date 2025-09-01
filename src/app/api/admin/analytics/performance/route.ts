import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { resolveDateRange } from '../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

function toISODate(d: Date): string { return d.toISOString().slice(0,10); }

async function handler(req: NextRequest, auth: AuthContext) {
  try {
    void auth;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(searchParams);
    const startISO = toISODate(range.start);
    const endExclusive = toISODate(new Date(range.end.getTime() + 24*60*60*1000));

    // Average latency by day and overall, plus error counts if any
    const [latencyRows, errorRows] = await Promise.all([
      supabase
        .from('message_token_costs')
        .select('usage_day:message_timestamp::date, avg_latency:avg(elapsed_ms), assistant_messages:count(*)')
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive)
        .order('usage_day', { ascending: true }),
      supabase
        .from('chat_messages')
        .select('message_timestamp, error_message', { count: 'exact' })
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive)
        .not('error_message', 'is', null)
    ]);

    // Transform latency series
    type LatencyRow = { usage_day: string; avg_latency: number; assistant_messages: number };
    const days = (latencyRows.data || []) as unknown as LatencyRow[];
    const series = days.map(d => ({ date: d.usage_day, avg_ms: Number(d.avg_latency || 0), messages: Number(d.assistant_messages || 0) }));

    // Overall averages
    let sumLatency = 0, sumMsgs = 0;
    for (const d of days) {
      sumLatency += Number(d.avg_latency || 0) * Number(d.assistant_messages || 0);
      sumMsgs += Number(d.assistant_messages || 0);
    }
    const overall_avg_ms = sumMsgs > 0 ? Math.round(sumLatency / sumMsgs) : 0;
    const error_count = errorRows.count || 0;

    return NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
      overall: { avg_ms: overall_avg_ms, error_count },
      daily: series
    });
  } catch (err) {
    logger.error('admin.analytics.performance error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
