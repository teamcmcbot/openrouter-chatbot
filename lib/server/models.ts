import { createClient } from '../supabase/server';
import { logger } from '../utils/logger';

export type SubscriptionTier = 'anonymous' | 'free' | 'pro' | 'enterprise';

export interface ServerModelConfig {
  context_length: number;
  description: string;
}

// Simple in-memory cache keyed by `${tier}` for list fetches and by `${tier}|${modelId}` for individual lookups
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const listCache = new Map<string, { ts: number; data: Record<string, ServerModelConfig> }>();
const itemCache = new Map<string, { ts: number; data: ServerModelConfig | null }>();

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

function tierToFilter(tier: SubscriptionTier): string {
  if (tier === 'enterprise') return 'is_free.eq.true,is_pro.eq.true,is_enterprise.eq.true';
  if (tier === 'pro') return 'is_free.eq.true,is_pro.eq.true';
  // anonymous and free paths share the same filter
  return 'is_free.eq.true';
}

// Narrow type for selected columns from model_access
interface ModelAccessRow {
  model_id: string;
  model_name?: string | null;
  model_description?: string | null;
  context_length?: number | null;
  status: 'active' | string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
}

export async function getServerModelConfigsForTier(tier: SubscriptionTier): Promise<Record<string, ServerModelConfig>> {
  const tierKey = tier;
  const cached = listCache.get(tierKey);
  if (cached && isFresh(cached.ts)) {
    return cached.data;
  }

  const supabase = await createClient();
  let query = supabase
    .from('model_access')
    .select(`
      model_id,
      model_name,
      model_description,
      context_length,
      status,
      is_free,
      is_pro,
      is_enterprise
    `)
    .eq('status', 'active');

  const orExpr = tierToFilter(tier);
  if (orExpr.includes(',')) {
    query = query.or(orExpr);
  } else {
    // is_free only
    query = query.eq('is_free', true);
  }

  const { data, error } = await query as unknown as { data: ModelAccessRow[] | null; error: unknown };
  if (error) {
    logger.error('[Model Configs] DB fetch failed', error);
    // Cache negative result to avoid hammering DB
    const empty: Record<string, ServerModelConfig> = {};
    listCache.set(tierKey, { ts: Date.now(), data: empty });
    return empty;
  }

  const map: Record<string, ServerModelConfig> = {};
  for (const row of (data || [])) {
    const id = row.model_id;
    const name = row.model_name ?? undefined;
    const desc = row.model_description ?? undefined;
    const ctx = row.context_length ?? undefined;
    map[id] = {
      context_length: typeof ctx === 'number' && ctx > 0 ? ctx : 8192,
      description: (name || desc || id),
    };
  }

  // Required one-liner log
  logger.info(`Fetching model configs from DB for ${tier} user: ${Object.keys(map).length} models found.`);

  listCache.set(tierKey, { ts: Date.now(), data: map });
  return map;
}

export async function getServerModelConfig(params: { modelId: string; tier: SubscriptionTier }): Promise<ServerModelConfig | null> {
  const { modelId, tier } = params;
  const cacheKey = `${tier}|${modelId}`;
  const cached = itemCache.get(cacheKey);
  if (cached && isFresh(cached.ts)) return cached.data;

  // Try to service from list cache first to save a DB roundtrip
  const list = await getServerModelConfigsForTier(tier);
  if (list[modelId]) {
    const found = list[modelId];
    itemCache.set(cacheKey, { ts: Date.now(), data: found });
    return found;
  }

  // Fallback: direct lookup (still respect tier filters)
  const supabase = await createClient();
  let query = supabase
    .from('model_access')
    .select(`
      model_id,
      model_name,
      model_description,
      context_length,
      status,
      is_free,
      is_pro,
      is_enterprise
    `)
    .eq('status', 'active')
    .eq('model_id', modelId)
    .limit(1);

  const orExpr = tierToFilter(tier);
  if (orExpr.includes(',')) query = query.or(orExpr);
  else query = query.eq('is_free', true);

  const { data, error } = await query as unknown as { data: ModelAccessRow[] | null; error: unknown };
  if (error) {
    logger.error('[Model Config] DB single fetch failed', error);
    itemCache.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  const row = (data && data[0]);
  if (!row) {
    itemCache.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }
  const ctx = row.context_length ?? undefined;
  const cfg: ServerModelConfig = {
    context_length: typeof ctx === 'number' && ctx > 0 ? ctx : 8192,
    description: (row.model_name || row.model_description || row.model_id),
  };
  itemCache.set(cacheKey, { ts: Date.now(), data: cfg });
  return cfg;
}
