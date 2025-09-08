import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { parseQuery, round6, buildTopModels } from '../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

export const dynamic = 'force-dynamic';

// Helper: safely await Supabase-like thenables used by tests (which provide a custom then(resolve)).
type ThenableResult<T> = { data: T[] | null; error: unknown };
async function awaitSelect<T>(q: unknown): Promise<ThenableResult<T>> {
  try {
    const maybe = q as { then?: (cb: (arg: ThenableResult<T>) => void) => void } | undefined;
    if (maybe && typeof maybe.then === 'function') {
      return await new Promise<ThenableResult<T>>((resolve) => maybe.then!(resolve));
    }
    const fallback = (q as ThenableResult<T>) ?? ({ data: null, error: null } as ThenableResult<T>);
    return fallback;
  } catch (e) {
    return { data: null, error: e } as ThenableResult<T>;
  }
}

async function getCostsHandler(req: NextRequest, auth: AuthContext) {
  const route = '/api/usage/costs';
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = auth;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'x-request-id': requestId } });
    }

    const { range, modelId, page, pageSize } = parseQuery(req);

    const startISO = range.start.toISOString();
    const endExclusive = new Date(range.end.getTime() + 24*60*60*1000).toISOString();

    const filters = supabase
      .from('message_token_costs')
      .select('assistant_message_id, session_id, model_id, message_timestamp, prompt_tokens, completion_tokens, total_tokens, prompt_cost, completion_cost, image_cost, output_image_cost, websearch_cost, total_cost, elapsed_ms', { count: 'exact' })
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
  const { data: allRows, error: aggError } = await awaitSelect<{ prompt_tokens: number; completion_tokens: number; total_cost: number; model_id: string | null; total_tokens: number }>(aggQuery);
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

    // Single INFO summary (sampled via logger config if needed)
  if ((logger as unknown as { infoOrDebug?: (msg: string, ...args: unknown[]) => void }).infoOrDebug) {
      logger.infoOrDebug('usage.costs.request.end', {
        requestId,
        route,
        ctx: {
          durationMs: Date.now() - t0,
          items: items?.length || 0,
          page,
          pageSize,
          total: count || 0,
          filteredModel: modelId || null,
        }
      });
    } else {
      logger.debug('usage.costs.request.end', {
      requestId,
      route,
        ctx: {
          durationMs: Date.now() - t0,
          items: items?.length || 0,
          page,
          pageSize,
          total: count || 0,
          filteredModel: modelId || null,
        }
      });
    }

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
    }, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    logger.error('usage.costs endpoint error', err);
  return handleError(err, requestId, route);
  }
}

export const GET = withProtectedAuth(
  withTieredRateLimit(getCostsHandler, { tier: 'tierC' })
);
