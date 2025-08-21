// lib/middleware/redisRateLimitMiddleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { AuthContext, AuthErrorCode } from '../types/auth';
import { createAuthError, handleAuthError } from '../utils/errors';
import { logger } from '../utils/logger';
import { addRateLimitHeaders } from './auth';

// Initialize Redis - uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
let redis: Redis | null = null;

try {
  // Only initialize Redis if environment variables are present
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
  // Note: For local development, use docker with Upstash-compatible setup
  // or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
} catch (error) {
  logger.warn('Redis initialization failed, rate limiting will be disabled:', error);
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

/**
 * Redis-based rate limiter using sliding window algorithm
 * Designed for serverless environments with persistent state
 */
async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 3600000 // 1 hour default
): Promise<RateLimitResult> {
  if (!redis) {
    // No Redis available - allow request but log warning
    logger.warn('Rate limiting disabled: Redis not configured');
    return {
      allowed: true,
      remaining: limit,
      resetTime: Date.now() + windowMs,
      totalRequests: 0,
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use Redis pipeline for atomic operations (4 commands total)
    const pipeline = redis.pipeline();

    // 1. Remove expired entries (older than window)
    pipeline.zremrangebyscore(key, 0, windowStart);

    // 2. Add current request with timestamp as score
    pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });

    // 3. Get current count in window
    pipeline.zcard(key);

    // 4. Set expiration on the key (cleanup)
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    // Execute all operations atomically
    const results = await pipeline.exec();
    const totalRequests = results[2] as number;

    const allowed = totalRequests <= limit;
    const remaining = Math.max(0, limit - totalRequests);
    const resetTime = now + windowMs;

    logger.debug('Redis rate limit check', {
      key,
      limit,
      totalRequests,
      allowed,
      remaining,
    });

    return {
      allowed,
      remaining,
      resetTime,
      totalRequests,
    };
  } catch (error) {
    logger.error('Redis rate limit error:', error);
    
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
 * Rate limiting middleware options
 */
export interface RateLimitOptions {
  customLimit?: number;
  windowMs?: number;
  keyGenerator?: (req: NextRequest, ctx: AuthContext) => string;
  skipRateLimit?: boolean;
}

/**
 * Generate rate limit key based on user or IP
 */
function generateRateLimitKey(request: NextRequest, authContext: AuthContext): string {
  // Use user ID if authenticated, otherwise fall back to IP
  if (authContext.user?.id) {
    return `rate_limit:user:${authContext.user.id}`;
  }

  // Get IP address with fallback
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  return `rate_limit:ip:${ip}`;
}

/**
 * Redis-based rate limiting middleware
 * Replaces the broken in-memory rate limiter for serverless environments
 */
export function withRedisRateLimit<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  options: RateLimitOptions = {}
) {
  return async (req: T, authContext: AuthContext): Promise<NextResponse> => {
    try {
      // Skip rate limiting if user has bypass or if explicitly skipped
      if (authContext.features.hasRateLimitBypass || options.skipRateLimit) {
        logger.debug('Rate limiting bypassed', { 
          userId: authContext.user?.id,
          reason: authContext.features.hasRateLimitBypass ? 'user_bypass' : 'option_skip'
        });
        return await handler(req, authContext);
      }

      // Determine rate limit based on user tier
      const limit = options.customLimit || authContext.features.maxRequestsPerHour;
      const windowMs = options.windowMs || 3600000; // 1 hour
      
      // Generate rate limit key
      const key = options.keyGenerator ? 
        options.keyGenerator(req, authContext) : 
        generateRateLimitKey(req, authContext);

      // Check rate limit using Redis
      const rateLimitResult = await checkRateLimit(key, limit, windowMs);
      
      logger.debug('Rate limit check', {
        key,
        limit,
        allowed: rateLimitResult.allowed,
        remaining: rateLimitResult.remaining,
        userId: authContext.user?.id,
        totalRequests: rateLimitResult.totalRequests,
      });

      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          key,
          limit,
          userId: authContext.user?.id,
          tier: authContext.profile?.subscription_tier,
          totalRequests: rateLimitResult.totalRequests,
        });

        const authError = createAuthError(
          AuthErrorCode.RATE_LIMIT_EXCEEDED,
          'Rate limit exceeded',
          `You have exceeded the rate limit of ${limit} requests per hour`,
          true,
          authContext.isAuthenticated ? 
            'Please wait before making more requests or consider upgrading your subscription' :
            'Please wait before making more requests or sign in for higher limits'
        );

        const errorResponse = handleAuthError(authError);
        
        // Add rate limit headers
        errorResponse.headers.set('X-RateLimit-Limit', limit.toString());
        errorResponse.headers.set('X-RateLimit-Remaining', '0');
        errorResponse.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());
        errorResponse.headers.set('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString());

        return errorResponse;
      }

      // Execute handler
      const response = await handler(req, authContext);

      // Add rate limit headers to successful response
      return addRateLimitHeaders(response, authContext, rateLimitResult.remaining);

    } catch (error) {
      logger.error('Rate limiting middleware error:', error);
      
      // If rate limiting fails, allow the request to proceed
      // This ensures rate limiting issues don't break the API
      logger.warn('Rate limiting failed, allowing request to proceed');
      return await handler(req, authContext);
    }
  };
}

/**
 * Get rate limit statistics (for monitoring)
 */
export async function getRateLimiterStats(): Promise<{
  redisConnected: boolean;
  totalKeys: number;
}> {
  if (!redis) {
    return { redisConnected: false, totalKeys: 0 };
  }

  try {
    // Get basic Redis info for monitoring
    const keys = await redis.dbsize();
    
    return {
      redisConnected: true,
      totalKeys: keys,
    };
  } catch (error) {
    logger.error('Failed to get rate limiter stats:', error);
    return { redisConnected: false, totalKeys: 0 };
  }
}

/**
 * Clear all rate limit data for a specific key (for testing/admin)
 */
export async function clearRateLimit(key: string): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Failed to clear rate limit:', error);
    return false;
  }
}
