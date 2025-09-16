import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../../lib/types/auth';
import { createClient } from '../../../../../../../lib/supabase/server';
import { parseQuery } from '../../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../../../lib/utils/headers';

export const dynamic = 'force-dynamic';

interface ViewRow { usage_date: string; model_id: string; total_tokens: number; total_cost: number; }


async function handler(req: NextRequest, auth: AuthContext) {
  const route = '/api/usage/costs/models/daily';
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = auth; if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const topModelsParam = url.searchParams.get('top_models');
    const topN = Math.min(Math.max(Number(topModelsParam) || 8, 1), 12); // clamp 1..12
    const { range, modelId } = parseQuery(req);

    // fetch from view (fallback raw table if view missing)
    const startISO = range.start.toISOString().slice(0,10); // yyyy-mm-dd
    const endISO = range.end.toISOString().slice(0,10);

    // We fetch rows for user & date span from view user_model_costs_daily if exists.
    // Supabase RPC check: easiest is to attempt select; if error complaining relation not found, fallback.
    // Prefer RPC for stricter access control; falls back to raw table if function missing
    const { data: viewRows, error: viewErr } = await supabase
      .rpc('get_user_model_costs_daily', { p_start: startISO, p_end: endISO, p_model_id: modelId });

  if (viewErr) {
      // fallback: aggregate from message_token_costs (should rarely happen)
      const start = new Date(range.start.getTime());
      const endPlus = new Date(range.end.getTime() + 24*60*60*1000);
      const { data: rawRows, error: rawErr } = await supabase
        .from('message_token_costs')
        .select('message_timestamp, model_id, total_tokens, total_cost')
        .eq('user_id', user.id)
        .gte('message_timestamp', start.toISOString())
        .lt('message_timestamp', endPlus.toISOString());
      if (rawErr) throw rawErr;
      const map: Record<string, Record<string, { tokens: number; cost: number }>> = {};
      for (const r of rawRows || []) {
        const d = new Date(r.message_timestamp as string).toISOString().slice(0,10);
        const m = r.model_id || 'unknown';
        map[d] = map[d] || {}; map[d][m] = map[d][m] || { tokens:0, cost:0 };
        map[d][m].tokens += r.total_tokens || 0;
        map[d][m].cost += Number(r.total_cost || 0);
      }
      const rows: ViewRow[] = [];
      Object.entries(map).forEach(([d, inner]) => {
        Object.entries(inner).forEach(([m, v]) => rows.push({ usage_date: d, model_id: m, total_tokens: v.tokens, total_cost: v.cost }));
      });
      return buildResponse(rows, range.start, range.end, topN, modelId, { requestId, route, t0 });
    }
    if (viewErr) throw viewErr;
    return buildResponse((viewRows||[]) as ViewRow[], range.start, range.end, topN, modelId, { requestId, route, t0 });
  } catch (err) {
    logger.error('usage.costs.models.daily.fail', { error: err, requestId, route });
  return handleError(err, requestId, route);
  }
}

function buildResponse(rows: ViewRow[], startDate: Date, endDate: Date, topN: number, filterModelId: string | null | undefined, meta?: { requestId: string; route: string; t0: number }) {
  // Filter single model if provided (affects model ordering & others)
  if (filterModelId) rows = rows.filter(r => r.model_id === filterModelId);
  // Aggregate totals per model
  const modelTotals: Record<string, { tokens: number; cost: number }> = {};
  for (const r of rows) {
    const key = r.model_id || 'unknown';
    if (!modelTotals[key]) modelTotals[key] = { tokens:0, cost:0 };
    modelTotals[key].tokens += r.total_tokens || 0;
    modelTotals[key].cost += Number(r.total_cost || 0);
  }
  const topByTokens = Object.entries(modelTotals).sort((a,b) => b[1].tokens - a[1].tokens).slice(0, topN).map(e => e[0]);
  const topByCost = Object.entries(modelTotals).sort((a,b) => b[1].cost - a[1].cost).slice(0, topN).map(e => e[0]);

  const dayList: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86400000)) {
    dayList.push(d.toISOString().slice(0,10));
  }
  const tokensDayData = dayList.map(date => ({ date, segments: {} as Record<string, number>, others: 0, total: 0 }));
  const costDayData = dayList.map(date => ({ date, segments: {} as Record<string, number>, others: 0, total: 0 }));
  const indexByDate: Record<string, number> = Object.fromEntries(tokensDayData.map((d,i)=>[d.date,i]));

  for (const r of rows) {
    const date = r.usage_date; const model = r.model_id || 'unknown';
    const ti = indexByDate[date]; if (ti === undefined) continue;
    const tokensRow = tokensDayData[ti];
    const costRow = costDayData[ti];
    const inTokensTop = topByTokens.includes(model);
    const inCostTop = topByCost.includes(model);
    if (inTokensTop) tokensRow.segments[model] = (tokensRow.segments[model]||0) + r.total_tokens;
    else tokensRow.others += r.total_tokens;
    if (inCostTop) costRow.segments[model] = (costRow.segments[model]||0) + Number(r.total_cost||0);
    else costRow.others += Number(r.total_cost||0);
  }
  for (const row of tokensDayData) { row.total = row.others + Object.values(row.segments).reduce((a,b)=>a+b,0); }
  for (const row of costDayData) { row.total = row.others + Object.values(row.segments).reduce((a,b)=>a+b,0); }

  const body = {
    range: { start: startDate.toISOString().slice(0,10), end: endDate.toISOString().slice(0,10) },
    charts: {
      tokens: { models: topByTokens, days: tokensDayData },
      cost: { models: topByCost, days: costDayData }
    }
  };
  const durationMs = meta ? (Date.now() - meta.t0) : 0;
  const headers = meta ? ({ 'x-request-id': meta.requestId } as Record<string,string>) : undefined;
  if (meta) {
    logger.info('usage.costs.models.daily.done', { requestId: meta.requestId, route: meta.route, durationMs, days: dayList.length, topN });
  }
  return NextResponse.json(body, { headers });
}

export const GET = withAuth(
  withTieredRateLimit(handler, { tier: 'tierC' }),
  { required: true, requireProfile: true, enforceBan: false }
);
