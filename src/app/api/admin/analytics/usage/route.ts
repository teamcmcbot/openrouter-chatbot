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

    // Aggregate per day using RLS-safe sources
    // - user_model_costs_daily (inherits admin read via message_token_costs) for daily users/messages/tokens
    // - message_token_costs for total messages in window
    // Prefer RPC; if unavailable (local/test), fall back to view
    const rpcDaily = await supabase
      .rpc('get_admin_user_model_costs_daily', { p_start: startISO, p_end: toISODate(range.end) });

  const dailyRows = (rpcDaily.error || !rpcDaily.data)
      ? await supabase
          .from('user_model_costs_daily')
          .select('usage_date, user_id, assistant_messages, total_tokens')
          .gte('usage_date', startISO)
          .lt('usage_date', endExclusive)
      : rpcDaily;

    const [totalMsgRows, anonDailyAgg, anonModelDaily] = await Promise.all([
      supabase
        .from('message_token_costs')
        .select('id', { count: 'exact', head: true })
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive),
      // Anonymous daily sessions/messages/tokens
      supabase
        .from('anonymous_usage_daily')
        .select('usage_date, anon_hash, messages_received')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive),
      supabase
        .from('anonymous_model_usage_daily')
        .select('usage_date, assistant_messages, total_tokens')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive)
    ]);

    if (dailyRows.error) throw dailyRows.error;
    if (totalMsgRows.error) throw totalMsgRows.error;
    if (anonDailyAgg.error) throw anonDailyAgg.error;
    if (anonModelDaily.error) throw anonModelDaily.error;

    const perDay: Record<string, { users: Set<string>; messages: number; tokens: number }> = {};
    for (const r of (dailyRows.data || []) as Array<{ usage_date: string; user_id: string; assistant_messages: number|null; total_tokens: number|null }>) {
      const d = r.usage_date;
      if (!perDay[d]) perDay[d] = { users: new Set<string>(), messages: 0, tokens: 0 };
      perDay[d].users.add(r.user_id);
      perDay[d].messages += Number(r.assistant_messages || 0);
      perDay[d].tokens += Number(r.total_tokens || 0);
    }

    const days = Object.keys(perDay).sort();
    const series = days.map(d => ({ date: d, active_users: perDay[d].users.size, messages: perDay[d].messages, tokens: perDay[d].tokens }));

    // Anonymous series: active sessions (distinct anon_hash per day) and assistant messages
    const anonPerDay: Record<string, { sessions: Set<string>; messages: number; tokens: number }> = {};
    for (const r of (anonDailyAgg.data || []) as Array<{ usage_date: string; anon_hash: string; messages_received: number|null }>) {
      const d = r.usage_date;
      if (!anonPerDay[d]) anonPerDay[d] = { sessions: new Set<string>(), messages: 0, tokens: 0 };
      if (r.anon_hash) anonPerDay[d].sessions.add(r.anon_hash);
      anonPerDay[d].messages += Number(r.messages_received || 0);
    }
    for (const r of (anonModelDaily.data || []) as Array<{ usage_date: string; assistant_messages: number|null; total_tokens: number|null }>) {
      const d = r.usage_date;
      if (!anonPerDay[d]) anonPerDay[d] = { sessions: new Set<string>(), messages: 0, tokens: 0 };
      anonPerDay[d].messages += Number(r.assistant_messages || 0);
      anonPerDay[d].tokens += Number(r.total_tokens || 0);
    }
    const anonDays = Object.keys(anonPerDay).sort();
    const anonSeries = anonDays.map(d => ({ date: d, active_users: anonPerDay[d].sessions.size, messages: anonPerDay[d].messages, tokens: anonPerDay[d].tokens }));

    const res = NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
  total_messages: totalMsgRows.count || 0,
      daily: series,
      segments: {
        authenticated: { total_messages: totalMsgRows.count || 0, daily: series },
        anonymous: { daily: anonSeries }
      }
    }, { headers: { 'x-request-id': requestId } });

    logger.infoOrDebug('admin.analytics.usage.complete', {
      requestId,
      route: '/api/admin/analytics/usage',
      ctx: { durationMs: Date.now() - t0, days: series.length, total_messages: totalMsgRows.count || 0 }
    });
    return res;
  } catch (err) {
    logger.error('admin.analytics.usage error', err, { requestId, route: '/api/admin/analytics/usage' });
  return handleError(err, requestId, '/api/admin/analytics/usage');
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
