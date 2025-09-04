import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { resolveDateRange } from '../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../../lib/utils/headers';

export const dynamic = 'force-dynamic';

function toISODate(d: Date): string { return d.toISOString().slice(0,10); }

async function handler(req: NextRequest, auth: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
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
    const [latencyRows, errorCount, anonAgg, anonErrorsCount] = await Promise.all([
      supabase
        .from('message_token_costs')
        .select('message_timestamp, elapsed_ms')
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive)
        .order('message_timestamp', { ascending: true }),
      supabase
        .rpc('get_error_count', { p_start_date: startISO, p_end_date: toISODate(range.end) })
      ,
      supabase
        .from('anonymous_model_usage_daily')
        .select('usage_date, generation_ms, assistant_messages')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive)
      ,
      supabase
        .rpc('get_anonymous_errors', { p_start_date: startISO, p_end_date: toISODate(range.end), p_limit: 0 })
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

    // Anonymous average latency per day based on aggregated generation_ms / assistant_messages
    type AnonRow = { usage_date: string; generation_ms: number | null; assistant_messages: number | null };
    const anonDailyMap = new Map<string, { totalMsgs: number; sumMs: number }>();
    for (const r of (anonAgg.data || []) as unknown as AnonRow[]) {
      const day = new Date(r.usage_date).toISOString().slice(0,10);
      const entry = anonDailyMap.get(day) || { totalMsgs: 0, sumMs: 0 };
      const msgs = Number(r.assistant_messages || 0);
      entry.totalMsgs += msgs;
      entry.sumMs += Number(r.generation_ms || 0);
      anonDailyMap.set(day, entry);
    }
    const anonSeries = Array.from(anonDailyMap.entries())
      .sort((a,b) => a[0] < b[0] ? -1 : 1)
      .map(([day, v]) => ({ date: day, avg_ms: v.totalMsgs > 0 ? Math.round(v.sumMs / v.totalMsgs) : 0, messages: v.totalMsgs }));
    let anonSumMs = 0, anonSumMsgs = 0;
    for (const v of anonDailyMap.values()) { anonSumMs += v.sumMs; anonSumMsgs += v.totalMsgs; }
    const anon_overall_avg_ms = anonSumMsgs > 0 ? Math.round(anonSumMs / anonSumMsgs) : 0;
  type AnonErrRow = { id: string };
  const anon_error_count = Array.isArray(anonErrorsCount.data) ? ((anonErrorsCount.data as unknown as AnonErrRow[]).length || 0) : 0;

    const res = NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
      overall: { avg_ms: overall_avg_ms, error_count },
      daily: series,
      segments: {
        authenticated: { overall: { avg_ms: overall_avg_ms, error_count }, daily: series },
        anonymous: { overall: { avg_ms: anon_overall_avg_ms, error_count: anon_error_count }, daily: anonSeries }
      }
    }, { headers: { 'x-request-id': requestId } });

    logger.infoOrDebug('admin.analytics.performance.complete', {
      requestId,
      route: '/api/admin/analytics/performance',
      ctx: { durationMs: Date.now() - t0, overall_avg_ms, error_count }
    });
    return res;
  } catch (err) {
    logger.error('admin.analytics.performance error', err, { requestId, route: '/api/admin/analytics/performance' });
    return handleError(err, requestId);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
