import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { resolveDateRange } from '../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

type GlobalCostRow = {
  usage_period: string; // yyyy-mm-dd
  model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  assistant_messages: number;
  distinct_users: number;
};

function toISODate(d: Date): string { return d.toISOString().slice(0,10); }

async function handler(req: NextRequest, auth: AuthContext) {
  try {
    void auth;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(searchParams);
  // Accept either g= or granularity=
  const granularity = (searchParams.get('granularity') || searchParams.get('g') || 'day').toLowerCase(); // day|week|month

    const { data, error } = await supabase.rpc('get_global_model_costs', {
      p_start_date: toISODate(range.start),
      p_end_date: toISODate(range.end),
      p_granularity: ['day','week','month'].includes(granularity) ? granularity : 'day'
    });
    if (error) throw error;

    const rows = (data || []) as GlobalCostRow[];

    // Identify top models by total cost across the period
    const totalsByModel: Record<string, { cost: number; tokens: number }> = {};
    for (const r of rows) {
      const k = r.model_id || 'unknown';
      if (!totalsByModel[k]) totalsByModel[k] = { cost: 0, tokens: 0 };
      totalsByModel[k].cost += Number(r.total_cost || 0);
      totalsByModel[k].tokens += Number(r.total_tokens || 0);
    }
    const topModels = Object.entries(totalsByModel)
      .sort((a,b) => b[1].cost - a[1].cost)
      .slice(0, 5)
      .map(([m]) => m);

    // Build stacked series per day/week/month
    const grouped: Record<string, Record<string, { cost: number; tokens: number }>> = {};
    for (const r of rows) {
      const day = r.usage_period; // already truncated by RPC
      const model = r.model_id || 'unknown';
      if (!grouped[day]) grouped[day] = {};
      const bucket = grouped[day][model] || { cost: 0, tokens: 0 };
      bucket.cost += Number(r.total_cost || 0);
      bucket.tokens += Number(r.total_tokens || 0);
      grouped[day][model] = bucket;
    }

    const days = Object.keys(grouped).sort();
    const costDays = days.map(d => {
      let others = 0, total = 0;
      const segments: Record<string, number> = {};
      for (const [model, v] of Object.entries(grouped[d])) {
        total += v.cost;
        if (topModels.includes(model)) segments[model] = v.cost; else others += v.cost;
      }
      return { date: d, segments, others, total };
    });
    const tokenDays = days.map(d => {
      let others = 0, total = 0;
      const segments: Record<string, number> = {};
      for (const [model, v] of Object.entries(grouped[d])) {
        total += v.tokens;
        if (topModels.includes(model)) segments[model] = v.tokens; else others += v.tokens;
      }
      return { date: d, segments, others, total };
    });

    // Totals
    let sumCost = 0, sumTokens = 0, msgs = 0, users = 0;
    for (const r of rows) {
      sumCost += Number(r.total_cost || 0);
      sumTokens += Number(r.total_tokens || 0);
      msgs += Number(r.assistant_messages || 0);
      users += Number(r.distinct_users || 0); // overcounts if many days; kept for rough indicator
    }

    return NextResponse.json({
      ok: true,
      range: { start: toISODate(range.start), end: toISODate(range.end), key: range.rangeKey },
      granularity: granularity,
      totals: { total_cost: sumCost, total_tokens: sumTokens, assistant_messages: msgs, distinct_users_estimate: users },
      stacked_cost: { models: topModels, days: costDays },
      stacked_tokens: { models: topModels, days: tokenDays }
    });
  } catch (err) {
    logger.error('admin.analytics.costs error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
