import { Redis } from '@upstash/redis';
import { createClient } from '../supabase/server';
import { logger } from '../utils/logger';
import type { CatalogProviderSlug } from '../constants/modelProviders';
import { CATALOG_PROVIDER_LABELS } from '../constants/modelProviders';
import type { ModelCatalogEntry, ModelCatalogPayload, TierGroup } from '../types/modelCatalog';

const ENVIRONMENT = (process.env.MODEL_CATALOG_ENV
  || process.env.NEXT_PUBLIC_APP_ENV
  || process.env.VERCEL_ENV
  || process.env.NODE_ENV
  || 'development')
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-');

const CACHE_KEY = `model-access:active:${ENVIRONMENT}`;
const DEFAULT_TTL_SECONDS = Number(process.env.MODEL_CATALOG_CACHE_TTL_SECONDS || 600);
const IN_MEMORY_TTL_MS = DEFAULT_TTL_SECONDS * 1000;

interface ModelAccessRow {
  model_id: string;
  model_name: string | null;
  model_description: string | null;
  context_length: number | null;
  input_modalities: unknown;
  output_modalities: unknown;
  supported_parameters: unknown;
  prompt_price: string | null;
  completion_price: string | null;
  request_price: string | null;
  image_price: string | null;
  output_image_price: string | null;
  web_search_price: string | null;
  internal_reasoning_price: string | null;
  input_cache_read_price: string | null;
  input_cache_write_price: string | null;
  max_completion_tokens: number | null;
  is_moderated: boolean | null;
  status: string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
  last_synced_at: string | null;
  updated_at: string | null;
}

type CachedPayload = { data: ModelCatalogPayload; expiresAt: number };

let redis: Redis | null = null;
let memoryCache: CachedPayload | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      redis = Redis.fromEnv();
      return redis;
    }
    return null;
  } catch (error) {
    logger.warn('Model catalog: Redis init failed; caching disabled', {
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function detectProvider(modelId: string): CatalogProviderSlug {
  const baseId = modelId.split(':')[0]?.toLowerCase() ?? '';
  const providerSegment = baseId.split('/')[0] ?? '';
  const normalized = providerSegment.replace(/[^a-z0-9]/gi, '').toLowerCase();

  if (normalized.startsWith('openai')) return 'openai';
  if (normalized.startsWith('google') || normalized.startsWith('gemini')) return 'google';
  if (normalized.startsWith('anthropic') || normalized.startsWith('claude')) return 'anthropic';

  const xaiPrefixes = ['xai', 'x', 'grok'];
  if (xaiPrefixes.some((prefix) => normalized.startsWith(prefix))) return 'xai';

  const zaiPrefixes = ['zai', 'zhipu'];
  if (zaiPrefixes.some((prefix) => normalized.startsWith(prefix))) return 'zai';

  const moonshotPrefixes = ['moonshot'];
  if (moonshotPrefixes.some((prefix) => normalized.startsWith(prefix))) return 'moonshot';

  if (normalized.startsWith('mistral')) return 'mistral';

  return 'other';
}

function deriveTierGroup(row: ModelAccessRow): TierGroup {
  if (row.is_free) return 'free';
  if (row.is_pro) return 'pro';
  return 'enterprise';
}

function formatPricing(row: ModelAccessRow) {
  return {
    prompt: row.prompt_price ?? '0',
    completion: row.completion_price ?? '0',
    request: row.request_price ?? '0',
    image: row.image_price,
    outputImage: row.output_image_price,
    webSearch: row.web_search_price,
    internalReasoning: row.internal_reasoning_price,
    cacheRead: row.input_cache_read_price,
    cacheWrite: row.input_cache_write_price,
  };
}

function sortCatalogEntries(models: ModelCatalogEntry[]): ModelCatalogEntry[] {
  return [...models].sort((a, b) => {
    const groupOrder = { free: 0, pro: 1, enterprise: 2 } as const;
    const groupDelta = groupOrder[a.tierGroup] - groupOrder[b.tierGroup];
    if (groupDelta !== 0) return groupDelta;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

async function fetchModelAccessRows(): Promise<ModelAccessRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('model_access')
    .select(
      `
        model_id,
        model_name,
        model_description,
        context_length,
        input_modalities,
        output_modalities,
        supported_parameters,
        prompt_price,
        completion_price,
        request_price,
        image_price,
        output_image_price,
        web_search_price,
        internal_reasoning_price,
        input_cache_read_price,
        input_cache_write_price,
        max_completion_tokens,
        is_moderated,
        status,
        is_free,
        is_pro,
        is_enterprise,
        last_synced_at,
        updated_at
      `
    )
    .eq('status', 'active')
    .or('is_free.eq.true,is_pro.eq.true,is_enterprise.eq.true');

  if (error) {
    logger.error('Model catalog: failed to fetch active models', error);
    throw error;
  }

  return (data as ModelAccessRow[]) || [];
}

function mapRowToEntry(row: ModelAccessRow): ModelCatalogEntry {
  const provider = detectProvider(row.model_id);
  return {
    id: row.model_id,
    name: row.model_name ?? row.model_id,
    description: row.model_description ?? row.model_name ?? row.model_id,
    contextLength: typeof row.context_length === 'number' && row.context_length > 0 ? row.context_length : 0,
    pricing: formatPricing(row),
    modalities: {
      input: parseStringArray(row.input_modalities),
      output: parseStringArray(row.output_modalities),
    },
    supportedParameters: parseStringArray(row.supported_parameters),
    provider: {
      slug: provider,
      label: CATALOG_PROVIDER_LABELS[provider],
    },
    tiers: {
      free: Boolean(row.is_free),
      pro: Boolean(row.is_pro),
      enterprise: Boolean(row.is_enterprise),
    },
    tierGroup: deriveTierGroup(row),
    maxCompletionTokens: row.max_completion_tokens ?? null,
    isModerated: Boolean(row.is_moderated),
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
  };
}

export async function invalidateModelCatalogCache(): Promise<void> {
  memoryCache = null;
  const redisClient = getRedis();
  if (!redisClient) return;

  try {
    await redisClient.del(CACHE_KEY);
  } catch (error) {
    logger.warn('Model catalog: failed to invalidate Redis cache', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function setRedisCache(payload: ModelCatalogPayload) {
  const redisClient = getRedis();
  if (!redisClient) return;

  try {
    await redisClient.set(CACHE_KEY, JSON.stringify(payload), { ex: DEFAULT_TTL_SECONDS });
  } catch (error) {
    logger.warn('Model catalog: failed to set Redis cache', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getRedisCache(): Promise<ModelCatalogPayload | null> {
  const redisClient = getRedis();
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get<unknown>(CACHE_KEY);
    if (!cached) return null;

    if (typeof cached === 'string') {
      return JSON.parse(cached) as ModelCatalogPayload;
    }
    if (typeof cached === 'object') {
      return cached as ModelCatalogPayload;
    }
    return null;
  } catch (error) {
    logger.warn('Model catalog: failed to read Redis cache', {
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function setMemoryCache(payload: ModelCatalogPayload) {
  memoryCache = {
    data: payload,
    expiresAt: Date.now() + IN_MEMORY_TTL_MS,
  };
}

function getMemoryCache(): ModelCatalogPayload | null {
  if (!memoryCache) return null;
  if (Date.now() > memoryCache.expiresAt) {
    memoryCache = null;
    return null;
  }
  return memoryCache.data;
}

export async function getModelCatalog(): Promise<ModelCatalogPayload> {
  const memoryHit = getMemoryCache();
  if (memoryHit) {
    logger.debug('Model catalog: serving from in-memory cache', { models: memoryHit.models.length });
    return memoryHit;
  }

  const redisHit = await getRedisCache();
  if (redisHit) {
    logger.debug('Model catalog: serving from Redis cache', { models: redisHit.models.length });
    setMemoryCache(redisHit);
    return redisHit;
  }

  const rows = await fetchModelAccessRows();
  const models = sortCatalogEntries(rows.map(mapRowToEntry));
  const payload: ModelCatalogPayload = {
    updatedAt: new Date().toISOString(),
    models,
  };

  setMemoryCache(payload);
  await setRedisCache(payload);

  logger.info('Model catalog: loaded fresh data', { models: models.length });
  return payload;
}
