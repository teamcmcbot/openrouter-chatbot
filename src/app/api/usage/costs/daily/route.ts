import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { parseQuery, round6 } from '../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../../lib/utils/headers';

export const dynamic = 'force-dynamic';

// Helper for test thenables (see usage/costs route)
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

async function getDailyHandler(req: NextRequest, auth: AuthContext) {
  const route = '/api/usage/costs/daily';
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = auth;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { range, modelId } = parseQuery(req);
    const startISO = range.start.toISOString();
    const endExclusive = new Date(range.end.getTime() + 24*60*60*1000).toISOString();

    const base = supabase
      .from('message_token_costs')
      .select('message_timestamp, prompt_tokens, completion_tokens, total_tokens, total_cost, model_id')
      .eq('user_id', user.id)
      .gte('message_timestamp', startISO)
      .lt('message_timestamp', endExclusive);
    if (modelId) base.eq('model_id', modelId);
  const { data: rows, error } = await awaitSelect<{ message_timestamp: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; total_cost: number; model_id: string | null }>(base);
    if (error) throw error;

    const dayMap: Record<string, { prompt: number; completion: number; total: number; cost: number; messages: number }> = {};
    let aggPrompt=0, aggComp=0, aggTokens=0, aggCost=0;
    for (const r of rows || []) {
      const ts = new Date(r.message_timestamp);
      const key = ts.toISOString().slice(0,10);
      if (!dayMap[key]) dayMap[key] = { prompt:0, completion:0, total:0, cost:0, messages:0 };
      dayMap[key].prompt += r.prompt_tokens || 0;
      dayMap[key].completion += r.completion_tokens || 0;
      dayMap[key].total += r.total_tokens || 0;
      dayMap[key].cost += Number(r.total_cost || 0);
      dayMap[key].messages += 1;
      aggPrompt += r.prompt_tokens || 0;
      aggComp += r.completion_tokens || 0;
      aggTokens += r.total_tokens || 0;
      aggCost += Number(r.total_cost || 0);
    }
    const items = Object.entries(dayMap)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([usage_date, v]) => ({
        usage_date,
        prompt_tokens: v.prompt,
        completion_tokens: v.completion,
        total_tokens: v.total,
        total_cost: round6(v.cost),
        assistant_messages: v.messages
      }));

    const json = {
      items,
      summary: {
        prompt_tokens: aggPrompt,
        completion_tokens: aggComp,
        total_tokens: aggTokens,
        total_cost: round6(aggCost)
      },
      range: {
        start: range.start.toISOString().slice(0,10),
        end: range.end.toISOString().slice(0,10),
        key: range.rangeKey
      }
    };

  const durationMs = Date.now() - t0;
  const headers = { 'x-request-id': requestId, 'X-Response-Time': String(durationMs) } as Record<string,string>;
  const maybe = logger as unknown as { infoOrDebug?: (msg: string, ...args: unknown[]) => void; debug: (msg: string, ...args: unknown[]) => void };
  if (typeof maybe.infoOrDebug === 'function') {
    maybe.infoOrDebug('usage.costs.daily.done', {
      requestId,
      route,
      durationMs,
      itemCount: items.length,
    });
  } else {
    logger.debug('usage.costs.daily.done', { requestId, route, durationMs, itemCount: items.length });
  }
  return NextResponse.json(json, { headers });
  } catch (err) {
    logger.error('usage.costs.daily.fail', { error: err, requestId, route });
  return handleError(err, requestId, route);
  }
}

export const GET = withAuth(
  withTieredRateLimit(getDailyHandler, { tier: 'tierC' }),
  { required: true, requireProfile: true, enforceBan: false }
);
