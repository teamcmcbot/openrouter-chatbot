// Utility helpers for usage cost endpoints
import { NextRequest } from 'next/server';

export interface DateRange {
  start: Date; // inclusive
  end: Date;   // inclusive
  rangeKey: string;
}

export interface ParsedQuery {
  range: DateRange;
  modelId?: string | null;
  page: number;
  pageSize: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveDateRange(params: URLSearchParams): DateRange {
  const rangeKey = (params.get('range') || '7d').toLowerCase();
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  function build(start: Date, rk: string): DateRange {
    return { start, end, rangeKey: rk };
  }

  if (rangeKey === 'today') {
    return build(end, 'today');
  }
  if (rangeKey === '7d') {
    const start = new Date(end.getTime() - 6 * MS_PER_DAY); // inclusive 7 days
    return build(start, '7d');
  }
  if (rangeKey === '30d') {
    const start = new Date(end.getTime() - 29 * MS_PER_DAY);
    return build(start, '30d');
  }

  // custom requires start & end query params (ISO / yyyy-mm-dd)
  const startParam = params.get('start');
  const endParam = params.get('end');
  if (!startParam || !endParam) {
    throw new Error('Custom range requires start and end');
  }
  const start = parseDateOnly(startParam);
  const customEnd = parseDateOnly(endParam);
  if (start > customEnd) throw new Error('Start must be <= end');
  return { start, end: customEnd, rangeKey: 'custom' };
}

export function parseDateOnly(val: string): Date {
  // Accept yyyy-mm-dd or full ISO; treat as UTC date boundary
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(val.trim());
  if (!m) throw new Error(`Invalid date: ${val}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${val}`);
  return d;
}

export function parsePositiveInt(value: string | null, def: number, max: number): number {
  if (!value) return def;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

export function parseQuery(req: NextRequest): ParsedQuery {
  const { searchParams } = new URL(req.url);
  const range = resolveDateRange(searchParams);
  const modelId = searchParams.get('model_id');
  const page = parsePositiveInt(searchParams.get('page'), 1, 10_000);
  const pageSize = parsePositiveInt(searchParams.get('page_size'), 50, 200);
  return { range, modelId: modelId || undefined, page, pageSize };
}

export interface CostSummaryModelRow {
  model_id: string | null;
  total_tokens: number;
  total_cost: number;
}

export interface TopModelsSummary {
  by_tokens: Array<{ model_id: string; total_tokens: number; total_cost: number; share_tokens: number; share_cost: number }>;
  by_cost: Array<{ model_id: string; total_tokens: number; total_cost: number; share_tokens: number; share_cost: number }>;
}

export function buildTopModels(rows: CostSummaryModelRow[], topN = 3): TopModelsSummary {
  const totalTokens = rows.reduce((a, r) => a + (r.total_tokens || 0), 0) || 0;
  const totalCost = rows.reduce((a, r) => a + Number(r.total_cost || 0), 0) || 0;
  const safe = (n: number, d: number) => d > 0 ? Number((n / d) * 100) : 0;

  const sortedTokens = [...rows].sort((a,b) => b.total_tokens - a.total_tokens).slice(0, topN);
  const sortedCost = [...rows].sort((a,b) => Number(b.total_cost) - Number(a.total_cost)).slice(0, topN);

  const mapRow = (r: CostSummaryModelRow) => ({
    model_id: r.model_id || 'unknown',
    total_tokens: r.total_tokens || 0,
    total_cost: Number(r.total_cost || 0),
    share_tokens: Number(safe(r.total_tokens || 0, totalTokens).toFixed(2)),
    share_cost: Number(safe(Number(r.total_cost || 0), totalCost).toFixed(2)),
  });

  return {
    by_tokens: sortedTokens.map(mapRow),
    by_cost: sortedCost.map(mapRow)
  };
}

export function round6(n: number): number {
  return Number(Number(n).toFixed(6));
}
