// lib/utils/redis-rate-limiter.ts
import { Redis } from "@upstash/redis";

// Initialize Redis connection
const redis = Redis.fromEnv(); // Uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

/**
 * Redis-based rate limiter using sliding window algorithm
 * This works in serverless environments because Redis persists state
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 3600000 // 1 hour default
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Remove expired entries (older than window)
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Add current request with timestamp as score
    pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });

    // Get current count in window
    pipeline.zcard(key);

    // Set expiration on the key (cleanup)
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    // Execute all operations atomically
    const results = await pipeline.exec();
    const totalRequests = results[2] as number;

    const allowed = totalRequests <= limit;
    const remaining = Math.max(0, limit - totalRequests);
    const resetTime = now + windowMs;

    return {
      allowed,
      remaining,
      resetTime,
      totalRequests,
    };
  } catch (error) {
    console.error("Redis rate limit error:", error);
    
    // Fallback: Allow request but log error
    // This prevents Redis outages from breaking your API
    return {
      allowed: true,
      remaining: limit,
      resetTime: now + windowMs,
      totalRequests: 0,
    };
  }
}

/**
 * Get rate limit info without incrementing counter
 */
export async function getRateLimitInfo(
  key: string,
  limit: number,
  windowMs: number = 3600000
): Promise<Omit<RateLimitResult, "allowed">> {
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Clean up expired entries
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Get current count
    const totalRequests = await redis.zcard(key);
    
    return {
      remaining: Math.max(0, limit - totalRequests),
      resetTime: now + windowMs,
      totalRequests,
    };
  } catch (error) {
    console.error("Redis rate limit info error:", error);
    return {
      remaining: limit,
      resetTime: now + windowMs,
      totalRequests: 0,
    };
  }
}
