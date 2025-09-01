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

    // Aggregate per day using RLS-safe sources
    // - user_model_costs_daily (inherits admin read via message_token_costs) for daily users/messages/tokens
    // - message_token_costs for total messages in window
    const [dailyRows, totalMsgRows] = await Promise.all([
      supabase
        .from('user_model_costs_daily')
        .select('usage_date, user_id, assistant_messages, total_tokens')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive),
      supabase
        .from('message_token_costs')
        .select('id', { count: 'exact', head: true })
        .gte('message_timestamp', startISO)
        .lt('message_timestamp', endExclusive)
    ]);

    if (dailyRows.error) throw dailyRows.error;
    if (totalMsgRows.error) throw totalMsgRows.error;

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

    return NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
  total_messages: totalMsgRows.count || 0,
      daily: series
    });
  } catch (err) {
    logger.error('admin.analytics.usage error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
