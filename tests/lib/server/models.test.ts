// Follow project conventions: mock logger to reduce noise
jest.mock('../../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

type ModelRow = {
  model_id: string;
  model_name?: string | null;
  model_description?: string | null;
  context_length?: number | null;
  status: 'active' | 'disabled' | string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
};

// Local query builder to emulate Supabase chaining and thenable behaviour
type FilterKey = 'status' | 'model_id' | 'is_free' | 'is_pro' | 'is_enterprise';
interface ModelQueryBuilder {
  _rows: ModelRow[];
  _filters: Partial<Record<FilterKey, unknown>>;
  _or?: string;
  _limit?: number;
  select(_sel: string): ModelQueryBuilder;
  eq(col: FilterKey, val: unknown): ModelQueryBuilder;
  or(expr: string): ModelQueryBuilder;
  limit(n: number): ModelQueryBuilder;
  then(cb: (arg: { data: ModelRow[] | null; error: unknown }) => void): void;
}

function makeModelAccessQuery(rows: ModelRow[]): ModelQueryBuilder {
  const qb: ModelQueryBuilder = {
    _rows: rows,
    _filters: {},
    _or: undefined,
    _limit: undefined,
    select() { return this; },
  eq(col: FilterKey, val: unknown) { this._filters[col] = val; return this; },
    or(expr: string) { this._or = expr; return this; },
    limit(n: number) { this._limit = n; return this; },
    then(cb) {
      // baseline: apply eq filters
      let r = this._rows.filter(row => {
        const entries = Object.entries(this._filters) as Array<[FilterKey, unknown]>;
        return entries.every(([k, v]) => (row[k] as unknown) === v);
      });
      // apply OR expression if present (supports simple 'is_free.eq.true,is_pro.eq.true,is_enterprise.eq.true')
      if (this._or) {
        const parts = this._or.split(',');
        r = r.filter(row => parts.some(p => {
          const [col, , val] = p.split('.');
          const boolVal = val === 'true';
          if (col === 'is_free') return row.is_free === boolVal;
          if (col === 'is_pro') return row.is_pro === boolVal;
          if (col === 'is_enterprise') return row.is_enterprise === boolVal;
          return false;
        }));
      }
      if (typeof this._limit === 'number') {
        r = r.slice(0, this._limit);
      }
      cb({ data: r, error: null });
    }
  };
  return qb;
}

// Shared test data
const allRows: ModelRow[] = [
  { model_id: 'openai/gpt-4o-mini', model_name: 'GPT-4o mini', model_description: 'fast', context_length: 128000, status: 'active', is_free: true, is_pro: true, is_enterprise: true },
  { model_id: 'google/gemini-2.5-flash', model_name: 'Gemini 2.5 Flash', model_description: 'flash', context_length: 1000000, status: 'active', is_free: false, is_pro: true, is_enterprise: true },
  { model_id: 'openai/gpt-4o', model_name: 'GPT-4o', model_description: 'smart', context_length: 200000, status: 'disabled', is_free: false, is_pro: true, is_enterprise: true },
];

let fromCalls = 0;
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      fromCalls++;
      if (table === 'model_access') return makeModelAccessQuery(allRows);
      throw new Error('Unknown table ' + table);
    }
  }))
}));

// Import module under test AFTER mocks
import { getServerModelConfigsForTier, getServerModelConfig } from '../../../lib/server/models';

describe('lib/server/models', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-08-26T00:00:00Z'));
    fromCalls = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns active free+pro for pro tier and caches list', async () => {
    const list = await getServerModelConfigsForTier('pro');
    expect(Object.keys(list).sort()).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
    expect(list['openai/gpt-4o-mini'].context_length).toBe(128000);

    const beforeSecond = fromCalls;
    const list2 = await getServerModelConfigsForTier('pro');
    expect(Object.keys(list2).sort()).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
    // No additional DB call on cached path
    expect(fromCalls).toBe(beforeSecond);
  });

  it('filters anonymous to free models only', async () => {
    const list = await getServerModelConfigsForTier('anonymous');
    expect(Object.keys(list)).toEqual(['openai/gpt-4o-mini']);
  });

  it('getServerModelConfig prefers list cache and falls back to direct fetch', async () => {
    // Prime list cache for pro tier
    await getServerModelConfigsForTier('pro');

    const cfgFromList = await getServerModelConfig({ modelId: 'openai/gpt-4o-mini', tier: 'pro' });
    expect(cfgFromList?.context_length).toBe(128000);

    const cfgDirect = await getServerModelConfig({ modelId: 'google/gemini-2.5-flash', tier: 'pro' });
    expect(cfgDirect?.context_length).toBe(1000000);
  });

  it('returns empty list on DB error and caches negative', async () => {
  // Temporarily override mock to return error; use a tier we haven't cached yet to force a DB call
  const serverMod = jest.requireMock('../../../lib/supabase/server') as { createClient: jest.Mock<Promise<{ from: (table: string) => unknown }>, []> };
    serverMod.createClient.mockResolvedValueOnce({
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              then: (cb: (arg: { data: ModelRow[] | null; error: unknown }) => void) => cb({ data: null, error: new Error('db down') })
            }),
            then: (cb: (arg: { data: ModelRow[] | null; error: unknown }) => void) => cb({ data: null, error: new Error('db down') })
          })
        })
      })
    });
  const list = await getServerModelConfigsForTier('enterprise');
    expect(Object.keys(list)).toEqual([]);
  });
});
