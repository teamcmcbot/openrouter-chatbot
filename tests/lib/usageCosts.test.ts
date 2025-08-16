import { resolveDateRange, parseQuery, buildTopModels, round6 } from '../../lib/utils/usageCosts';
import { NextRequest } from 'next/server';

describe('usageCosts utilities', () => {
  test('resolveDateRange presets today', () => {
    const params = new URLSearchParams({ range: 'today' });
    const r = resolveDateRange(params);
    expect(r.rangeKey).toBe('today');
    // start == end for today preset
    expect(r.start.toISOString().slice(0,10)).toBe(r.end.toISOString().slice(0,10));
  });

  test('resolveDateRange 7d covers 7 days inclusive', () => {
    const params = new URLSearchParams({ range: '7d' });
    const r = resolveDateRange(params);
    const diffDays = Math.round((r.end.getTime() - r.start.getTime()) / (24*60*60*1000)) + 1; // inclusive count
    expect(diffDays).toBe(7);
  });

  test('custom range requires start/end', () => {
    const params = new URLSearchParams({ range: 'custom', start: '2025-01-01', end: '2025-01-05' });
    const r = resolveDateRange(params);
    expect(r.rangeKey).toBe('custom');
    expect(r.start.toISOString().slice(0,10)).toBe('2025-01-01');
    expect(r.end.toISOString().slice(0,10)).toBe('2025-01-05');
  });

  test('buildTopModels sorts and computes shares', () => {
    const rows = [
      { model_id: 'a', total_tokens: 100, total_cost: 2 },
      { model_id: 'b', total_tokens: 300, total_cost: 1 },
      { model_id: 'c', total_tokens: 50, total_cost: 5 }
    ];
    const top = buildTopModels(rows, 2);
    expect(top.by_tokens[0].model_id).toBe('b');
    expect(top.by_cost[0].model_id).toBe('c');
    // share sums approximations
    const tokenShareSum = top.by_tokens.reduce((a,r)=> a + r.share_tokens, 0);
    expect(tokenShareSum).toBeGreaterThan(0);
  });

  test('round6 enforces 6 decimal precision', () => {
    expect(round6(0.123456789)).toBe(0.123457);
  });
});

describe('parseQuery integration', () => {
  function makeReq(url: string): NextRequest {
    return { url } as unknown as NextRequest; // minimal shape for parseQuery usage
  }

  test('default values', () => {
    const req = makeReq('https://example.com/api/usage/costs');
    const { page, pageSize, range } = parseQuery(req);
    expect(page).toBe(1);
    expect(pageSize).toBe(50);
    expect(range.rangeKey).toBe('7d');
  });

  test('custom paging + model', () => {
    const req = makeReq('https://example.com/api/usage/costs?page=2&page_size=25&model_id=m1');
    const parsed = parseQuery(req);
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.modelId).toBe('m1');
  });
});
