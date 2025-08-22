import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { parseQuery, round6, buildTopModels } from '../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

async function getCostsHandler(req: NextRequest, auth: AuthContext) {
  try {
    const supabase = await createClient();
    const { user } = auth;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { range, modelId, page, pageSize } = parseQuery(req);

    const startISO = range.start.toISOString();
    const endExclusive = new Date(range.end.getTime() + 24*60*60*1000).toISOString();

    const filters = supabase
      .from('message_token_costs')
      .select('assistant_message_id, session_id, model_id, message_timestamp, prompt_tokens, completion_tokens, total_tokens, prompt_cost, completion_cost, image_cost, total_cost, elapsed_ms', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('message_timestamp', startISO)
      .lt('message_timestamp', endExclusive)
      .order('message_timestamp', { ascending: false });

    if (modelId) filters.eq('model_id', modelId);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: items, error, count } = await filters.range(from, to);
    if (error) throw error;

    const aggQuery = supabase
      .from('message_token_costs')
      .select('prompt_tokens, completion_tokens, total_cost, model_id, total_tokens')
      .eq('user_id', user.id)
      .gte('message_timestamp', startISO)
      .lt('message_timestamp', endExclusive);
    if (modelId) aggQuery.eq('model_id', modelId);
    const { data: allRows, error: aggError } = await aggQuery;
    if (aggError) throw aggError;

    let sumPrompt = 0, sumCompletion = 0, sumTokens = 0, sumCost = 0;
    const perModel: Record<string, { total_tokens: number; total_cost: number }> = {};
    for (const r of allRows || []) {
      sumPrompt += r.prompt_tokens || 0;
      sumCompletion += r.completion_tokens || 0;
      sumTokens += r.total_tokens || 0;
      sumCost += Number(r.total_cost || 0);
      const key = r.model_id || 'unknown';
      if (!perModel[key]) perModel[key] = { total_tokens: 0, total_cost: 0 };
      perModel[key].total_tokens += r.total_tokens || 0;
      perModel[key].total_cost += Number(r.total_cost || 0);
    }
    const modelArray = Object.entries(perModel).map(([model_id, v]) => ({ model_id, total_tokens: v.total_tokens, total_cost: v.total_cost }));
    const topModels = buildTopModels(modelArray, 3);
    const costPer1k = sumTokens > 0 ? round6(sumCost * 1000 / sumTokens) : 0;

    return NextResponse.json({
      items: items || [],
      pagination: {
        page,
        page_size: pageSize,
        total: count || 0,
        total_pages: count ? Math.max(1, Math.ceil(count / pageSize)) : 1
      },
      summary: {
        prompt_tokens: sumPrompt,
        completion_tokens: sumCompletion,
        total_tokens: sumTokens,
        total_cost: round6(sumCost),
        cost_per_1k: costPer1k,
        top_models: topModels
      },
      range: {
        start: range.start.toISOString().slice(0,10),
        end: range.end.toISOString().slice(0,10),
        key: range.rangeKey
      }
    });
  } catch (err) {
    logger.error('usage.costs endpoint error', err);
    return handleError(err);
  }
}

export const GET = withProtectedAuth(
  withTieredRateLimit(getCostsHandler, { tier: 'tierC' })
);
