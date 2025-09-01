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

    // Average latency by day and overall, plus error counts (admin-wide)
    // - Latency from message_token_costs (admins can read all via RLS policy)
    //   Use avg(nullif(elapsed_ms,0)) to ignore legacy zeros.
    // - Errors via SECURITY DEFINER function to bypass RLS safely for admins
    const [latencyRows, errorCount] = await Promise.all([
      supabase
        .from('message_token_costs')
        .select('message_timestamp, elapsed_ms')
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive)
        .order('message_timestamp', { ascending: true }),
      supabase
        .rpc('get_error_count', { p_start_date: startISO, p_end_date: toISODate(range.end) })
    ]);

    if (latencyRows.error) throw latencyRows.error;

    type RawRow = { message_timestamp: string; elapsed_ms: number | null };
    const rows = (latencyRows.data || []) as unknown as RawRow[];

    // Group by day and compute averages excluding zeros/nulls
    const dayMap = new Map<string, { totalMsgs: number; nonZeroCount: number; nonZeroSum: number }>();
    for (const r of rows) {
      const day = new Date(r.message_timestamp).toISOString().slice(0,10);
      const entry = dayMap.get(day) || { totalMsgs: 0, nonZeroCount: 0, nonZeroSum: 0 };
      entry.totalMsgs += 1;
      const v = Number(r.elapsed_ms || 0);
      if (v > 0) { entry.nonZeroCount += 1; entry.nonZeroSum += v; }
      dayMap.set(day, entry);
    }

    const series = Array.from(dayMap.entries())
      .sort((a,b) => a[0] < b[0] ? -1 : 1)
      .map(([day, v]) => ({
        date: day,
        avg_ms: v.nonZeroCount > 0 ? Math.round(v.nonZeroSum / v.nonZeroCount) : 0,
        messages: v.totalMsgs,
      }));

    // Overall average across all non-zero rows
    let grandCount = 0, grandSum = 0;
    for (const v of dayMap.values()) { grandCount += v.nonZeroCount; grandSum += v.nonZeroSum; }
    const overall_avg_ms = grandCount > 0 ? Math.round(grandSum / grandCount) : 0;
    const error_count = (errorCount.data as unknown as number) ?? 0;

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
