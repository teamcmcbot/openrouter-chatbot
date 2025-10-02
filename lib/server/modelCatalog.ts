import { Redis } from '@upstash/redis';
import { createClient } from '../supabase/server';
import { logger } from '../utils/logger';
import type { CatalogProviderSlug } from '../constants/modelProviders';
import { CATALOG_PROVIDER_LABELS } from '../constants/modelProviders';
import type { ModelCatalogEntry, ModelCatalogClientPayload, TierGroup } from '../types/modelCatalog';
import { buildClientCatalog, countClientModels } from '../utils/modelCatalogClient';

/**
 * Model catalog caching strategy:
 * - Environment-specific Redis key (see CACHE_KEY) prevents cross-env bleed.
 * - Short-lived in-memory cache keeps hot page reloads warm on a single instance.
 * - Redis TTL defaults to 10 minutes but can be tuned via MODEL_CATALOG_CACHE_TTL_SECONDS.
 * - Use invalidateModelCatalogCache when a manual bust is required (e.g., after sync jobs).
 */
const RAW_ENVIRONMENT = (process.env.NODE_ENV || 'development').toString().trim();
const ENVIRONMENT = (RAW_ENVIRONMENT === '' ? 'development' : RAW_ENVIRONMENT)
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
  output_image_price: string | null;
  max_completion_tokens: number | null;
  is_moderated: boolean | null;
  status: string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
  last_synced_at: string | null;
  updated_at: string | null;
}

type CachedPayload = { data: ModelCatalogClientPayload; expiresAt: number };

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

export function detectProvider(modelId: string): CatalogProviderSlug {
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
    // Performance optimization: request_price and image_price omitted from catalog query
    // These fields are only fetched in getModelById() for individual model detail pages
    // This reduces database load and speeds up catalog page rendering
    request: '0', // Not fetched in catalog query
    image: null, // Not fetched in catalog query
    outputImage: row.output_image_price,
    webSearch: null, // Not fetched in catalog query (optimization)
    internalReasoning: null, // Not fetched in catalog query (optimization)
    cacheRead: null, // Not fetched in catalog query (optimization)
    cacheWrite: null, // Not fetched in catalog query (optimization)
  };
}

export function sortCatalogEntries(models: ModelCatalogEntry[]): ModelCatalogEntry[] {
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
        output_image_price,
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

async function setRedisCache(payload: ModelCatalogClientPayload) {
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

async function getRedisCache(): Promise<ModelCatalogClientPayload | null> {
  const redisClient = getRedis();
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get<unknown>(CACHE_KEY);
    if (!cached) return null;

    if (typeof cached === 'string') {
      try {
        return JSON.parse(cached) as ModelCatalogClientPayload;
      } catch (error) {
        logger.warn('Model catalog: failed to parse Redis cache payload', {
          err: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
    if (typeof cached === 'object') {
      return cached as ModelCatalogClientPayload;
    }
    return null;
  } catch (error) {
    logger.warn('Model catalog: failed to read Redis cache', {
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function setMemoryCache(payload: ModelCatalogClientPayload) {
  memoryCache = {
    data: payload,
    expiresAt: Date.now() + IN_MEMORY_TTL_MS,
  };
}

function getMemoryCache(): ModelCatalogClientPayload | null {
  if (!memoryCache) return null;
  if (Date.now() > memoryCache.expiresAt) {
    memoryCache = null;
    return null;
  }
  return memoryCache.data;
}

/**
 * Retrieves the model catalog with client-ready data and pre-computed counts.
 * Uses in-memory cache (fastest) → Redis (fast) → Database (slowest).
 *
 * PHASE 2 OPTIMIZATION:
 * - Caches ModelCatalogClientPayload (client-ready transformed data)
 * - Pre-computes popular filter counts (9 count operations)
 * - Eliminates per-request transformation overhead (~2000+ operations)
 *
 * @returns Client-ready model catalog with pre-computed counts
 */
export async function getModelCatalog(): Promise<ModelCatalogClientPayload> {
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

  // PHASE 2: Transform to client format and pre-compute counts on cache miss
  const rows = await fetchModelAccessRows();
  const models = sortCatalogEntries(rows.map(mapRowToEntry));
  const clientModels = buildClientCatalog(models);
  
  const payload: ModelCatalogClientPayload = {
    updatedAt: new Date().toISOString(),
    models: clientModels,
    popularFilterCounts: {
      free: countClientModels(clientModels, 'free'),
      multimodal: countClientModels(clientModels, 'multimodal'),
      reasoning: countClientModels(clientModels, 'reasoning'),
      image: countClientModels(clientModels, 'image'),
      openai: countClientModels(clientModels, undefined, 'openai'),
      google: countClientModels(clientModels, undefined, 'google'),
      anthropic: countClientModels(clientModels, undefined, 'anthropic'),
      freeGoogle: countClientModels(clientModels, 'free', 'google'),
      paid: countClientModels(clientModels, 'paid'),
    },
  };

  setMemoryCache(payload);
  await setRedisCache(payload);

  logger.info('Model catalog: loaded fresh data with client transformation', { 
    models: clientModels.length,
    counts: payload.popularFilterCounts 
  });
  return payload;
}

/**
 * Fetch full model details including ALL pricing columns for detail pages.
 * This bypasses the optimized catalog cache and fetches directly from database.
 * Use this for /models/[modelId] pages where all pricing fields are displayed.
 */
async function fetchFullModelDetails(modelId: string): Promise<ModelCatalogEntry | null> {
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
    .eq('model_id', modelId)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    logger.debug('Model not found in database', { modelId, error });
    return null;
  }

  // Format full pricing with all fields
  const fullPricing = {
    prompt: data.prompt_price ?? '0',
    completion: data.completion_price ?? '0',
    request: data.request_price ?? '0',
    image: data.image_price,
    outputImage: data.output_image_price,
    webSearch: data.web_search_price,
    internalReasoning: data.internal_reasoning_price,
    cacheRead: data.input_cache_read_price,
    cacheWrite: data.input_cache_write_price,
  };

  const provider = detectProvider(data.model_id);
  const tierGroup = data.is_free ? 'free' : data.is_pro ? 'pro' : 'enterprise';

  return {
    id: data.model_id,
    name: data.model_name ?? data.model_id,
    description: data.model_description ?? data.model_name ?? data.model_id,
    contextLength: typeof data.context_length === 'number' && data.context_length > 0 ? data.context_length : 0,
    pricing: fullPricing,
    modalities: {
      input: parseStringArray(data.input_modalities),
      output: parseStringArray(data.output_modalities),
    },
    supportedParameters: parseStringArray(data.supported_parameters),
    provider: {
      slug: provider,
      label: CATALOG_PROVIDER_LABELS[provider],
    },
    tiers: {
      free: Boolean(data.is_free),
      pro: Boolean(data.is_pro),
      enterprise: Boolean(data.is_enterprise),
    },
    tierGroup,
    maxCompletionTokens: data.max_completion_tokens ?? null,
    isModerated: Boolean(data.is_moderated),
    lastSyncedAt: data.last_synced_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Fetch a single model by its ID.
 * For detail pages, this fetches full data including all pricing fields.
 * Returns null if the model is not found.
 */
export async function getModelById(modelId: string): Promise<ModelCatalogEntry | null> {
  // For detail pages, fetch full model details with all pricing columns
  return fetchFullModelDetails(modelId);
}

/**
 * Count models matching specific filter criteria from a given catalog.
 * @deprecated Phase 2: Use pre-computed popularFilterCounts from getModelCatalog() for common filters,
 * or use countClientModels() from modelCatalogClient.ts for custom filter combinations.
 */
export function countModelsInCatalog(
  catalog: ModelCatalogClientPayload,
  featureFilter?: 'free' | 'paid' | 'multimodal' | 'reasoning' | 'image',
  providerFilter?: CatalogProviderSlug
): number {
  // Use pre-computed counts for popular filter combinations
  if (!providerFilter) {
    switch (featureFilter) {
      case 'free': return catalog.popularFilterCounts.free;
      case 'multimodal': return catalog.popularFilterCounts.multimodal;
      case 'reasoning': return catalog.popularFilterCounts.reasoning;
      case 'image': return catalog.popularFilterCounts.image;
      case 'paid': return catalog.popularFilterCounts.paid;
    }
  }
  if (!featureFilter) {
    switch (providerFilter) {
      case 'openai': return catalog.popularFilterCounts.openai;
      case 'google': return catalog.popularFilterCounts.google;
      case 'anthropic': return catalog.popularFilterCounts.anthropic;
    }
  }
  if (featureFilter === 'free' && providerFilter === 'google') {
    return catalog.popularFilterCounts.freeGoogle;
  }
  
  // For uncommon filter combinations, compute on the fly
  return countClientModels(catalog.models, featureFilter, providerFilter);
}

/**
 * Count models matching specific filter criteria.
 * Used for generating "Popular Filters" links with accurate counts.
 * @deprecated Phase 2: Use pre-computed popularFilterCounts from getModelCatalog() instead.
 */
export async function countModelsByFilter(
  featureFilter?: 'free' | 'paid' | 'multimodal' | 'reasoning' | 'image',
  providerFilter?: CatalogProviderSlug
): Promise<number> {
  const catalog = await getModelCatalog();
  // Use pre-computed counts when available
  if (!providerFilter) {
    switch (featureFilter) {
      case 'free': return catalog.popularFilterCounts.free;
      case 'multimodal': return catalog.popularFilterCounts.multimodal;
      case 'reasoning': return catalog.popularFilterCounts.reasoning;
      case 'image': return catalog.popularFilterCounts.image;
      case 'paid': return catalog.popularFilterCounts.paid;
    }
  }
  if (!featureFilter) {
    switch (providerFilter) {
      case 'openai': return catalog.popularFilterCounts.openai;
      case 'google': return catalog.popularFilterCounts.google;
      case 'anthropic': return catalog.popularFilterCounts.anthropic;
    }
  }
  if (featureFilter === 'free' && providerFilter === 'google') {
    return catalog.popularFilterCounts.freeGoogle;
  }
  
  // Fallback: compute on the fly for uncommon combinations
  return countClientModels(catalog.models, featureFilter, providerFilter);
}
