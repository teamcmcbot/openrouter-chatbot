# Fix Broken Serverless Caching Architecture

## Priority: 🚨 CRITICAL - Performance & Cost Issue

## Overview

**Current Issue**: The `unstable_cache` implementation for model data caching is broken on Vercel's serverless platform. Cache state is not persisted between function invocations, causing cache misses on every request.

**Performance Impact**: Every `/api/models` request triggers a fresh OpenRouter API call, adding 2-5 seconds latency instead of <100ms cached response.

**Cost Impact**: 10-50x more OpenRouter API calls than expected, plus extended function execution time waiting for API responses.

## Technical Analysis

### Current Broken Implementation

```typescript
// /api/models/route.ts
const getCachedModels = unstable_cache(
  async () => {
    const models = await fetchOpenRouterModels(); // 2-5 second API call
    return models;
  },
  ['openrouter-models'],
  { revalidate: 600 } // "10 minutes" - actually resets every request
);

// Vercel Reality:
Request 1: Cold start -> Cache miss -> 5s OpenRouter API call
Request 2: New container -> Cache miss -> 5s OpenRouter API call
Request 3: Same as above -> Cache miss -> 5s OpenRouter API call
// "10 minute cache" becomes "never cached"
```

### Root Cause Analysis

- **Serverless Cold Starts**: New container = empty cache
- **Memory Isolation**: No shared memory between function invocations
- **Cache Lifecycle**: `unstable_cache` only persists within single execution
- **Development Mismatch**: Works in dev (persistent process), fails in production

### Cost Impact Calculation

```typescript
// Expected with working cache:
// 1000 users/day load models -> ~100 OpenRouter API calls (10-minute cache)
// Function duration: 1000 × 0.1s = 100 seconds total
// Cost: 100s × 2GB = 0.056 GB-Hours ≈ $0.01/day

// Reality with broken cache:
// 1000 users/day load models -> 1000 OpenRouter API calls (cache miss every time)
// Function duration: 1000 × 3s = 3000 seconds total
// Cost: 3000s × 2GB = 1.67 GB-Hours ≈ $0.30/day
// **30x higher cost due to cache misses**
```

## Solution Architecture

### Phase 1: Database-Based Caching (This Week)

#### Supabase Cache Table Design

```sql
-- Create cache table in Supabase
CREATE TABLE IF NOT EXISTS cache_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  cache_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX idx_cache_entries_key_expires ON cache_entries(cache_key, expires_at);

-- Function to clean expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cache_entries WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

#### Database Cache Implementation

```typescript
// lib/utils/serverlessCache.ts
import { createClient } from "../supabase/server";

export interface CacheOptions {
  ttlMinutes?: number;
  refreshThreshold?: number; // Refresh if expires within this many minutes
}

export class ServerlessCache {
  private supabase = createClient();

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const { data, error } = await this.supabase
      .from("cache_entries")
      .select("cache_data, expires_at")
      .eq("cache_key", key)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (error || !data) {
      return null;
    }

    // Check if needs refresh soon (background refresh pattern)
    const { refreshThreshold = 2 } = options;
    const expiresAt = new Date(data.expires_at);
    const refreshAt = new Date(Date.now() + refreshThreshold * 60 * 1000);

    if (expiresAt < refreshAt) {
      // Mark for background refresh (don't await)
      this.markForRefresh(key).catch(console.error);
    }

    return data.cache_data as T;
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const { ttlMinutes = 10 } = options;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.supabase.from("cache_entries").upsert({
      cache_key: key,
      cache_data: value,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async invalidate(key: string): Promise<void> {
    await this.supabase.from("cache_entries").delete().eq("cache_key", key);
  }

  private async markForRefresh(key: string): Promise<void> {
    // Could trigger background refresh job or extend TTL slightly
    // For now, just log for monitoring
    console.log(`Cache key ${key} needs refresh soon`);
  }
}
```

### Phase 2: Redis + Database Hybrid (Next Month)

#### Redis as L1 Cache, Database as L2

```typescript
// lib/utils/hybridCache.ts
export class HybridCache {
  private redis = Redis.fromEnv();
  private dbCache = new ServerlessCache();

  async get<T>(key: string): Promise<T | null> {
    // Try Redis first (L1 cache - fastest)
    const redisData = await this.redis.get(key);
    if (redisData) {
      return JSON.parse(redisData);
    }

    // Fallback to database cache (L2 cache - more persistent)
    const dbData = await this.dbCache.get<T>(key);
    if (dbData) {
      // Populate Redis for next request
      await this.redis.setex(key, 300, JSON.stringify(dbData)); // 5 minute Redis TTL
      return dbData;
    }

    return null;
  }

  async set<T>(key: string, value: T, ttlMinutes = 10): Promise<void> {
    // Store in both caches
    await Promise.all([
      this.redis.setex(key, 300, JSON.stringify(value)), // 5 minutes in Redis
      this.dbCache.set(key, value, { ttlMinutes }), // Longer TTL in database
    ]);
  }
}
```

## Implementation Plan

### Week 1: Database Cache Implementation

#### Day 1-2: Database Setup

- [ ] **Create cache table in Supabase**
  ```sql
  -- Run migration script
  -- Set up RLS policies for cache_entries table
  -- Create cleanup function and scheduled job
  ```
- [ ] **Create serverless cache utility**
  ```typescript
  // lib/utils/serverlessCache.ts
  // Implement get, set, invalidate methods
  // Add TTL management and background refresh
  ```
- [ ] **Add cache monitoring**
  ```typescript
  // Track cache hit/miss ratios
  // Monitor cache performance
  // Set up alerts for low hit rates
  ```

#### Day 3-4: Models Endpoint Migration

- [ ] **Replace unstable_cache in /api/models**

  ```typescript
  // BEFORE (Broken):
  const getCachedModels = unstable_cache(
    async () => fetchOpenRouterModels(),
    ["openrouter-models"],
    { revalidate: 600 }
  );

  // AFTER (Fixed):
  const cache = new ServerlessCache();

  async function getCachedModels() {
    const cached = await cache.get<ModelInfo[]>("openrouter-models");
    if (cached) return cached;

    const fresh = await fetchOpenRouterModels();
    await cache.set("openrouter-models", fresh, { ttlMinutes: 10 });
    return fresh;
  }
  ```

- [ ] **Add cache invalidation triggers**
  ```typescript
  // Invalidate cache when models are synced
  // Add manual cache refresh endpoint for admin
  ```

#### Day 5-7: Testing & Optimization

- [ ] **Performance testing**
  - Measure cache hit rates
  - Compare latency: cached vs uncached
  - Load test with concurrent requests
- [ ] **Cache optimization**
  - Tune TTL values based on real usage
  - Implement stale-while-revalidate pattern
  - Add cache warming strategies

### Week 2-3: Extended Cache Implementation

#### Additional Endpoints to Cache

```typescript
// Priority order for caching implementation:

1. /api/models (DONE - Week 1)
2. /api/user/data (user profile data)
3. /api/admin/users (admin user list)
4. /api/usage/costs (usage statistics)
5. /api/health/cache (system health data)
```

#### Cache Strategy per Endpoint

```typescript
const CACHE_STRATEGIES = {
  "/api/models": {
    ttl: 600, // 10 minutes - models change infrequently
    refreshThreshold: 120, // Refresh if expiring in 2 minutes
    invalidateOn: ["admin.sync-models"],
  },

  "/api/user/data": {
    ttl: 300, // 5 minutes - user data changes occasionally
    refreshThreshold: 60,
    invalidateOn: ["user.update-profile", "user.update-preferences"],
  },

  "/api/admin/users": {
    ttl: 120, // 2 minutes - admin data needs to be fresh
    refreshThreshold: 30,
    invalidateOn: ["user.created", "user.updated", "user.deleted"],
  },
};
```

## Cache Invalidation Strategy

### Event-Driven Invalidation

```typescript
// lib/utils/cacheInvalidation.ts
export class CacheInvalidationManager {
  private cache = new ServerlessCache();

  async invalidateOnEvent(event: string, metadata?: any) {
    const invalidationRules = {
      "user.profile.updated": (meta) => [
        `user-profile-${meta.userId}`,
        "admin-users-list",
      ],
      "models.synced": () => ["openrouter-models", "admin-models-list"],
      "subscription.changed": (meta) => [
        `user-profile-${meta.userId}`,
        `user-features-${meta.userId}`,
      ],
    };

    const keysToInvalidate = invalidationRules[event]?.(metadata) || [];

    await Promise.all(
      keysToInvalidate.map((key) => this.cache.invalidate(key))
    );
  }
}

// Usage in API endpoints:
const invalidationManager = new CacheInvalidationManager();

// After updating user profile:
await invalidationManager.invalidateOnEvent("user.profile.updated", {
  userId: user.id,
});
```

### Background Cache Warming

```typescript
// api/cron/cache-warming/route.ts
export async function GET() {
  const cache = new ServerlessCache();

  // Warm frequently accessed caches
  const warmingTasks = [
    warmModelsCache(),
    warmPopularUserProfiles(),
    warmAdminDashboardData(),
  ];

  await Promise.allSettled(warmingTasks);

  return NextResponse.json({ status: "Cache warming completed" });
}

async function warmModelsCache() {
  const models = await fetchOpenRouterModels();
  await cache.set("openrouter-models", models, { ttlMinutes: 10 });
}
```

## Performance Monitoring

### Cache Metrics to Track

```typescript
interface CacheMetrics {
  hit_rate: number; // Percentage of cache hits
  miss_rate: number; // Percentage of cache misses
  avg_response_time_cached: number; // Avg response time for cache hits
  avg_response_time_uncached: number; // Avg response time for cache misses
  cache_size_mb: number; // Total cache storage used
  expired_entries_cleaned: number; // Entries cleaned up
}
```

### Monitoring Dashboard

```typescript
// api/admin/cache/stats/route.ts
export async function GET() {
  const stats = await getCacheStats();
  return NextResponse.json({
    metrics: stats,
    recommendations: generateCacheRecommendations(stats),
  });
}

function generateCacheRecommendations(stats: CacheMetrics) {
  const recommendations = [];

  if (stats.hit_rate < 0.8) {
    recommendations.push("Consider increasing cache TTL values");
  }

  if (stats.avg_response_time_cached > 100) {
    recommendations.push("Database cache queries are slow - consider Redis");
  }

  return recommendations;
}
```

## Cost Analysis

### Database Storage Costs

```typescript
// Estimated cache storage requirements:
// - Models data: ~50KB per cache entry
// - User profiles: ~2KB per user
// - Admin data: ~10KB per cache entry

// For 1000 users:
// Storage: ~2MB total cache data
// Supabase cost: <$0.01/month (negligible)
```

### Performance Improvements

```typescript
// Before (broken cache):
// /api/models response time: 3-5 seconds
// User experience: Poor (long loading)
// Function cost: 3s × 2GB = 0.0017 GB-Hours per request

// After (database cache):
// /api/models response time: 100-200ms
// User experience: Excellent (instant loading)
// Function cost: 0.2s × 2GB = 0.0001 GB-Hours per request
// **85% cost reduction per request**
```

## Testing Strategy

### Unit Tests

```typescript
// tests/utils/serverlessCache.test.ts
describe("Serverless Cache", () => {
  let cache: ServerlessCache;

  beforeEach(() => {
    cache = new ServerlessCache();
  });

  it("should store and retrieve cached data", async () => {
    await cache.set("test-key", { data: "test" });
    const result = await cache.get("test-key");
    expect(result).toEqual({ data: "test" });
  });

  it("should return null for expired entries", async () => {
    await cache.set("test-key", { data: "test" }, { ttlMinutes: 0.01 });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const result = await cache.get("test-key");
    expect(result).toBeNull();
  });

  it("should handle cache invalidation", async () => {
    await cache.set("test-key", { data: "test" });
    await cache.invalidate("test-key");
    const result = await cache.get("test-key");
    expect(result).toBeNull();
  });
});
```

### Integration Tests

```typescript
// tests/api/models.cache.integration.test.ts
describe("Models API Caching", () => {
  it("should cache models data effectively", async () => {
    // First request - cache miss
    const start1 = Date.now();
    const response1 = await fetch("/api/models");
    const duration1 = Date.now() - start1;

    // Second request - cache hit
    const start2 = Date.now();
    const response2 = await fetch("/api/models");
    const duration2 = Date.now() - start2;

    expect(duration2).toBeLessThan(duration1 * 0.2); // 80% faster
    expect(response1.json()).toEqual(response2.json());
  });
});
```

### Load Testing

```bash
# artillery config for cache testing
# cache-load-test.yml
config:
  target: 'https://your-app.vercel.app'
  phases:
    - duration: 60
      arrivalRate: 10

scenarios:
  - name: "Models endpoint load test"
    requests:
      - get:
          url: "/api/models"
```

## Risk Mitigation

### Potential Issues & Solutions

1. **Database Cache Latency**

   - **Risk**: Database queries slower than expected
   - **Mitigation**: Implement Redis as L1 cache, database as L2

2. **Cache Consistency**

   - **Risk**: Stale data served to users
   - **Mitigation**: Event-driven invalidation, TTL optimization

3. **Cache Storage Growth**

   - **Risk**: Unlimited cache growth
   - **Mitigation**: Automated cleanup, size monitoring, LRU eviction

4. **Cache Dependencies**
   - **Risk**: Cache becomes single point of failure
   - **Mitigation**: Graceful degradation, fallback to direct API calls

## Success Criteria

### Week 1 Goals

- [ ] Database cache implemented and operational
- [ ] /api/models response time <500ms (95th percentile)
- [ ] Cache hit rate >80% after initial warm-up
- [ ] Zero cache-related errors in production

### Week 2-3 Goals

- [ ] All major endpoints using database cache
- [ ] Overall API response time improved by >60%
- [ ] Cache storage usage <10MB
- [ ] Cache invalidation working correctly

### Long-term Goals

- [ ] Cache hit rate >90%
- [ ] Average API response time <200ms
- [ ] 80% reduction in OpenRouter API calls
- [ ] Automated cache optimization based on usage patterns

---

## Conclusion

This fix addresses a critical performance and cost issue where the broken caching system causes every request to trigger expensive API calls and extended function execution times.

**Impact**: Implementing proper serverless caching will improve user experience by 5-10x while reducing costs by 80%+ for cached endpoints.

**Priority**: Critical for user experience and cost optimization.

**Timeline**: 1 week for database cache implementation, 2-3 weeks for full optimization.
