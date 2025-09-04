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
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
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

  // Aggregate global costs by model across the range (authenticated)
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

    // Anonymous aggregates in parallel
    const [{ data: anonModelCosts, error: anonErr }, { data: anonUsageRows, error: anonUsageErr }] = await Promise.all([
      supabase.rpc('get_anonymous_model_costs', {
        p_start_date: startISO,
        p_end_date: toISODate(range.end),
        p_granularity: 'day'
      }),
      supabase
        .from('anonymous_usage_daily')
        .select('messages_sent, messages_received, total_tokens, anon_hash')
        .gte('usage_date', startISO)
        .lt('usage_date', endExclusive)
    ]);
    if (anonErr) throw anonErr;
    if (anonUsageErr) throw anonUsageErr;

    // Reduce anonymous usage rows
    let anonTotalTokens = 0, anonTotalMsgs = 0;
    const anonHashes = new Set<string>();
    for (const r of (anonUsageRows || []) as Array<{ messages_sent: number|null; messages_received: number|null; total_tokens: number|null; anon_hash: string }>) {
      anonTotalTokens += Number(r.total_tokens || 0);
      anonTotalMsgs += Number(r.messages_sent || 0) + Number(r.messages_received || 0);
      if (r.anon_hash) anonHashes.add(r.anon_hash);
    }
    const anonUsageTotals = { total_tokens: anonTotalTokens, messages: anonTotalMsgs, anon_sessions: anonHashes.size };

    // Top anonymous models by estimated cost
    type AnonCostRow = { model_id: string; estimated_cost: number; total_tokens: number };
    const anonPerModel: Record<string, { total_cost: number; total_tokens: number }> = {};
    let anonSumCost = 0, anonSumTokens = 0, anonAssistant = 0;
    for (const row of (anonModelCosts || []) as unknown as Array<AnonCostRow & { assistant_messages: number }>) {
      const key = row.model_id || 'unknown';
      if (!anonPerModel[key]) anonPerModel[key] = { total_cost: 0, total_tokens: 0 };
      anonPerModel[key].total_cost += Number(row.estimated_cost || 0);
      anonPerModel[key].total_tokens += Number(row.total_tokens || 0);
      anonSumCost += Number(row.estimated_cost || 0);
      anonSumTokens += Number(row.total_tokens || 0);
      anonAssistant += Number(row.assistant_messages || 0);
    }
    const anonTop = Object.entries(anonPerModel)
      .map(([model_id, v]) => ({ model_id, total_cost: v.total_cost, total_tokens: v.total_tokens }))
      .sort((a,b) => b.total_cost - a.total_cost)
      .slice(0,5);
    const anonCostsTotals = { total_cost: anonSumCost, total_tokens: anonSumTokens, assistant_messages: anonAssistant };

    // Sync stats and model counts (best-effort)
    const [syncStatsRes, modelCountsRes] = await Promise.all([
      supabase.from('v_sync_stats').select('*').limit(1),
      supabase.from('v_model_counts_public').select('*').limit(1)
    ]);

    const res = NextResponse.json({
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
      segments: {
        authenticated: {
          totals: { messages: totalMessagesCount },
          usage_7d: usageTotals,
          costs_7d: costsTotals,
          top_models: top
        },
        anonymous: {
          usage_7d: anonUsageTotals,
          costs_7d: anonCostsTotals,
          top_models: anonTop
        }
      },
      sync: (syncStatsRes.data && syncStatsRes.data[0]) || null,
      model_counts: (modelCountsRes.data && modelCountsRes.data[0]) || null
    }, { headers: { 'x-request-id': requestId } });

  // Guard logger.info for test mocks that omit it
  const hasInfo = typeof (logger as { info?: unknown }).info === 'function';
  if (hasInfo) (logger as unknown as { info: (msg: string, ctx?: unknown) => void }).info('admin.analytics.overview.complete', {
      requestId,
      route: '/api/admin/analytics/overview',
      ctx: {
        durationMs: Date.now() - t0,
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessagesCount,
      },
  }); else logger.debug('admin.analytics.overview.complete', {
      requestId,
      route: '/api/admin/analytics/overview',
      ctx: {
        durationMs: Date.now() - t0,
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessagesCount,
      },
    });
    return res;
  } catch (err) {
    logger.error('admin.analytics.overview error', err, { requestId, route: '/api/admin/analytics/overview' });
  return handleError(err, requestId, '/api/admin/analytics/overview');
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
