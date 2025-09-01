import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { resolveDateRange } from '../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

function toISODate(d: Date): string {
  return d.toISOString().slice(0,10);
}

type GlobalCostRow = {
  usage_period: string;
  model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  assistant_messages: number;
  distinct_users: number;
};

async function handler(req: NextRequest, auth: AuthContext) {
  try {
    void auth; // ensure param is considered used
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(searchParams);
    const startISO = toISODate(range.start);
    const endExclusive = toISODate(new Date(range.end.getTime() + 24*60*60*1000));

    // Parallel aggregate queries
    const [profilesCount, sessionsCount, messagesCount, usageRows, globalCosts] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('chat_sessions').select('id', { count: 'exact', head: true }),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
      supabase
        .from('user_usage_daily')
        .select('messages_sent, messages_received, total_tokens')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive),
      supabase.rpc('get_global_model_costs', {
        p_start_date: startISO,
        p_end_date: toISODate(range.end),
        p_granularity: 'day'
      })
    ]);

    const totalUsers = profilesCount.count ?? 0;
    const totalConversations = sessionsCount.count ?? 0;
  const totalMessagesCount = messagesCount.count ?? 0;

    // Reduce usage rows
  let totalTokens = 0, totalMsgs = 0;
    for (const r of (usageRows.data || []) as Array<{ messages_sent: number | null; messages_received: number | null; total_tokens: number | null }>) {
  totalTokens += Number(r.total_tokens || 0);
  totalMsgs += Number(r.messages_sent || 0) + Number(r.messages_received || 0);
    }
  const usageTotals = { total_tokens: totalTokens, messages: totalMsgs };

    // Aggregate global costs by model across the range
    const costsData = (globalCosts.data || []) as GlobalCostRow[];
    const perModel: Record<string, { total_cost: number; total_tokens: number }> = {};
    let sumCost = 0, sumTokens = 0, sumAssistant = 0;
    for (const row of costsData) {
      const key = row.model_id || 'unknown';
      if (!perModel[key]) perModel[key] = { total_cost: 0, total_tokens: 0 };
      perModel[key].total_cost += Number(row.total_cost || 0);
      perModel[key].total_tokens += Number(row.total_tokens || 0);
      sumCost += Number(row.total_cost || 0);
      sumTokens += Number(row.total_tokens || 0);
      sumAssistant += Number(row.assistant_messages || 0);
    }
    const top = Object.entries(perModel)
      .map(([model_id, v]) => ({ model_id, total_cost: v.total_cost, total_tokens: v.total_tokens }))
      .sort((a,b) => b.total_cost - a.total_cost)
      .slice(0,5);
    const costsTotals = { total_cost: sumCost, total_tokens: sumTokens, assistant_messages: sumAssistant };

    // Sync stats and model counts (best-effort)
    const [syncStatsRes, modelCountsRes] = await Promise.all([
      supabase.from('v_sync_stats').select('*').limit(1),
      supabase.from('v_model_counts_public').select('*').limit(1)
    ]);

    return NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
      totals: {
        users: totalUsers,
        conversations: totalConversations,
  messages: totalMessagesCount,
        usage_7d: usageTotals,
        costs_7d: costsTotals
      },
      top_models: top,
      sync: (syncStatsRes.data && syncStatsRes.data[0]) || null,
      model_counts: (modelCountsRes.data && modelCountsRes.data[0]) || null
    });
  } catch (err) {
    logger.error('admin.analytics.overview error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
