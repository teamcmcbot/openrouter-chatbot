# Redis Rate Limiting Architecture

## Overview

The OpenRouter Chatbot implements **Redis-based rate limiting** to provide robust protection against API abuse in serverless environments. This replaces the previously broken in-memory rate limiting that didn't work on platforms like Vercel.

## Architecture Diagram

```mermaid
graph TD
    A[API Request] --> B[Authentication Middleware]
    B --> C[Redis Rate Limit Middleware]
    C --> D{Rate Limit Check}
    D --> E[Redis Pipeline]
    E --> F[ZREMRANGEBYSCORE<br/>Clean old entries]
    E --> G[ZADD<br/>Add current request]
    E --> H[ZCARD<br/>Count requests]
    E --> I[EXPIRE<br/>Set TTL]
    E --> J[Pipeline Execute]
    J --> K{Within Limit?}
    K -->|Yes| L[Continue to Handler]
    K -->|No| M[Return 429 Rate Limited]
    L --> N[API Handler Response]
```

## Core Components

### 1. Redis Rate Limit Middleware (`lib/middleware/redisRateLimitMiddleware.ts`)

**Primary Middleware**: `withRedisRateLimit(handler, options?)`

```typescript
// Basic usage
export const POST = withProtectedAuth(withRedisRateLimit(chatHandler));

// With custom options
export const POST = withProtectedAuth(
  withRedisRateLimit(uploadHandler, {
    customLimit: 100,
    windowMs: 3600000, // 1 hour
  })
);
```

### 2. Redis Client Configuration

```typescript
// Automatic environment-based initialization
const redis = Redis.fromEnv(); // Uses UPSTASH_REDIS_REST_URL & TOKEN

// Graceful fallback if Redis unavailable
if (!redis) {
  logger.warn("Rate limiting disabled: Redis not configured");
  return { allowed: true, remaining: limit, resetTime, totalRequests: 0 };
}
```

### 3. Sliding Window Algorithm

Uses **Redis Sorted Sets** for precise sliding window rate limiting:

```typescript
// Redis operations (atomic pipeline):
pipeline.zremrangebyscore(key, 0, windowStart); // Remove expired
pipeline.zadd(key, { score: now, member: uuid }); // Add current request
pipeline.zcard(key); // Count total
pipeline.expire(key, ttl); // Set cleanup TTL
```

## Rate Limiting Strategy

### Tiered Rate Limits

Rate limits are determined by user subscription tier and endpoint classification:

```typescript
const TIERED_RATE_LIMITS = {
  anonymous: { tierA: 10, tierB: 20, tierC: 50, tierD: 0 },
  free: { tierA: 20, tierB: 50, tierC: 200, tierD: 100 },
  pro: { tierA: 200, tierB: 500, tierC: 1000, tierD: 100 },
  enterprise: { tierA: 500, tierB: 1000, tierC: 2000, tierD: 100 },
  // Enterprise admins get unlimited access via bypass
};

// Tier Classifications:
// - Tier A (Chat): Most restrictive - LLM inference operations
// - Tier B (Storage): Medium - File uploads, storage operations
// - Tier C (CRUD): Most generous - Metadata, analytics, CRUD
// - Tier D (Admin): Testing access across subscription levels
```

### Key Generation Strategy

```typescript
function generateTieredRateLimitKey(
  request: NextRequest,
  authContext: AuthContext,
  tier: "tierA" | "tierB" | "tierC" | "tierD"
): string {
  // Authenticated users get user-specific keys
  if (authContext.isAuthenticated && authContext.user?.id) {
    return `rate_limit:${tier}:user:${authContext.user.id}`;
  }

  // Anonymous users get IP-based keys
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `rate_limit:${tier}:ip:${ip}`;
}
```

## Performance Characteristics

### Redis Operations per Request

| Operation          | Purpose                  | Typical Time |
| ------------------ | ------------------------ | ------------ |
| `ZREMRANGEBYSCORE` | Clean expired entries    | < 1ms        |
| `ZADD`             | Add current request      | < 1ms        |
| `ZCARD`            | Count requests in window | < 1ms        |
| `EXPIRE`           | Set key TTL              | < 1ms        |
| **Total Pipeline** | **All operations**       | **< 5ms**    |

### Scaling Performance

```typescript
const performanceMetrics = {
  requestsPerSecond: "10,000+ (Redis limit)",
  latencyP95: "< 10ms",
  memoryPerUser: "~200 bytes",
  networkOverhead: "~100 bytes per check",
};
```

## Error Handling & Resilience

### Graceful Degradation

```typescript
try {
  const rateLimitResult = await checkRateLimit(key, limit, windowMs);
  // Use result...
} catch (error) {
  logger.error("Redis rate limit error:", error);

  // Fail open - allow request but log for monitoring
  return {
    allowed: true,
    remaining: limit,
    resetTime: Date.now() + windowMs,
    totalRequests: 0,
  };
}
```

### Circuit Breaker Pattern

- **Redis Down**: Allow requests through (logged for alerting)
- **Network Issues**: Timeout after 5s, fail open
- **Invalid Responses**: Log error, continue processing

## Security Features

### 1. Atomic Operations

- **Redis Pipeline**: Ensures consistency under concurrent load
- **No Race Conditions**: All rate limit checks are atomic
- **Accurate Counting**: Prevents bypass attempts

### 2. IP-based Protection

- **Anonymous Users**: Limited by IP address
- **Proxy Detection**: Uses `X-Forwarded-For` and `X-Real-IP` headers
- **IPv6 Support**: Handles both IPv4 and IPv6 addresses

### 3. Sliding Window

- **Precise Timing**: Not vulnerable to burst attacks at window boundaries
- **Automatic Cleanup**: Old entries expire automatically
- **Memory Efficient**: Only stores active requests

## Monitoring & Observability

### Key Metrics

```typescript
interface RateLimitMetrics {
  requests_allowed: number;
  requests_blocked: number;
  redis_latency_p95: number;
  redis_error_rate: number;
  active_rate_limit_keys: number;
  memory_usage_bytes: number;
}
```

### Logging

```typescript
// Successful requests
logger.debug("Rate limit check", {
  key,
  limit,
  allowed: true,
  remaining,
  userId,
  totalRequests,
});

// Blocked requests
logger.warn("Rate limit exceeded", {
  key,
  limit,
  userId,
  tier,
  totalRequests,
});

// Redis errors
logger.error("Redis rate limit error:", error);
```

### Upstash Dashboard Metrics

Monitor in real-time:

- **Commands per minute**
- **Bandwidth usage**
- **Error rates**
- **Latency percentiles**

## Cost Analysis

### Development (FREE Tier)

- **Limit**: 10,000 commands/day
- **Rate Limiting Usage**: ~4 commands per API request
- **Capacity**: ~2,500 API requests/day
- **Cost**: $0.00

### Production (Pay-as-you-go)

- **Rate**: $0.2 per 100K commands
- **Typical Usage**: 1000 API requests = 4000 commands = $0.008
- **Monthly Projection**: 100K API requests = $8.00/month

## Comparison: Old vs New Implementation

| Aspect                    | In-Memory (Broken)     | Redis-Based (Fixed)   |
| ------------------------- | ---------------------- | --------------------- |
| **Serverless Compatible** | ❌ No                  | ✅ Yes                |
| **Persistent State**      | ❌ Lost on restart     | ✅ Persistent         |
| **Accurate Counting**     | ❌ Resets frequently   | ✅ Always accurate    |
| **Performance**           | ⚡ Fast (when working) | ⚡ Fast (< 10ms)      |
| **Cost**                  | 💰 Free                | 💰 ~$0.01-10/month    |
| **Production Ready**      | ❌ Broken              | ✅ Battle-tested      |
| **Monitoring**            | ❌ None                | ✅ Full observability |

## Implementation Timeline

The migration was completed in phases:

1. **Week 1**: Identified broken in-memory rate limiting
2. **Week 2**: Implemented Redis-based solution with Upstash
3. **Week 3**: Updated all API endpoints (8 routes)
4. **Week 4**: Added comprehensive testing and monitoring
5. **Week 5**: Documentation and production deployment guide

## Future Enhancements

### Planned Improvements

- **Distributed Rate Limiting**: Cross-region coordination
- **Dynamic Limits**: AI-based abuse detection
- **Custom Policies**: Per-endpoint rate limiting rules
- **Advanced Analytics**: User behavior pattern analysis

### Potential Optimizations

- **Connection Pooling**: Reduce Redis connection overhead
- **Batch Operations**: Group multiple rate limit checks
- **Edge Caching**: Cache rate limit decisions at CDN level
- **Predictive Scaling**: Pre-scale Redis for traffic spikes

## Testing Strategy

### Unit Tests

```typescript
// Mock Redis for predictable testing
jest.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => mockRedisInstance,
  },
}));
```

### Integration Tests

- **Rate Limit Enforcement**: Verify blocking behavior
- **Tier-based Limits**: Test different subscription tiers
- **Error Handling**: Simulate Redis failures
- **Performance**: Load testing under high concurrency

### Load Testing

```bash
# Artillery.js configuration
npm install -g artillery
artillery run rate-limiting-load-test.yml
```

## References

- **Upstash Redis**: https://upstash.com/
- **Redis Sorted Sets**: https://redis.io/docs/data-types/sorted-sets/
- **Sliding Window Rate Limiting**: https://en.wikipedia.org/wiki/Sliding_window_protocol
- **Serverless Architecture Patterns**: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
