// lib/middleware/redisRateLimitMiddleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { AuthContext, AuthErrorCode, UserProfile } from '../types/auth';
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
 * Tiered rate limiting configuration
 */
export interface EndpointRateLimitConfig {
  tier: "tierA" | "tierB" | "tierC" | "tierD";
  customWindowMs?: number;
  burstCapacity?: number;
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
 * Generate tiered rate limit key based on endpoint tier
 * @internal - exported for testing
 */
export function generateTieredRateLimitKey(
  request: NextRequest,
  authContext: AuthContext,
  tier: string
): string {
  // Use user ID if authenticated, otherwise fall back to IP
  if (authContext.user?.id) {
    return `rate_limit:${tier}:user:${authContext.user.id}`;
  }

  // Get IP address with fallback
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  return `rate_limit:${tier}:ip:${ip}`;
}

/**
 * Calculate tiered rate limit based on subscription tier and account type
 * @internal - exported for testing
 */
export function calculateTieredLimit(
  tier: "tierA" | "tierB" | "tierC" | "tierD",
  subscriptionTier?: UserProfile["subscription_tier"],
  accountType?: UserProfile["account_type"]
): number {
  const limits = {
    anonymous: { tierA: 10, tierB: 20, tierC: 50, tierD: 0 },      // A<B<C (chat most restrictive)
    free: { tierA: 20, tierB: 50, tierC: 200, tierD: 0 },          // A<B<C (chat most restrictive)
    pro: { tierA: 200, tierB: 100, tierC: 500, tierD: 0 },         // A<B<C (chat most restrictive) 
    enterprise: { tierA: 500, tierB: 200, tierC: 1000, tierD: 0 }, // A<B<C (chat most restrictive)
  };

  // Enterprise admin bypass
  if (subscriptionTier === "enterprise" && accountType === "admin") {
    return Infinity; // No rate limits for enterprise admins
  }

  // Determine effective tier - anonymous users get special limits
  const effectiveTier = subscriptionTier || "anonymous";
  
  // Type-safe access to limits
  if (effectiveTier in limits) {
    const tierLimits = limits[effectiveTier as keyof typeof limits];
    return tierLimits[tier];
  }
  
  // Fallback to free tier
  return limits.free[tier];
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
        endpoint: new URL(req.url).pathname,
        totalRequests: rateLimitResult.totalRequests,
      });

      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          key,
          limit,
          userId: authContext.user?.id,
          tier: authContext.profile?.subscription_tier,
          endpoint: new URL(req.url).pathname,
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

/**
 * Tiered rate limiting middleware wrapper
 * Applies different rate limits based on endpoint tier and user subscription
 */
export function withTieredRateLimit<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  config: EndpointRateLimitConfig
) {
  return withRedisRateLimitEnhanced(handler, {
    tier: config.tier,
    windowMs: config.customWindowMs || 3600000, // 1 hour default
    skipRateLimit: false,
  });
}

/**
 * Enhanced withRedisRateLimit that supports tiered limits
 * This overrides the customLimit calculation to use tiered limits
 */
export function withRedisRateLimitEnhanced<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  options: RateLimitOptions & { tier?: "tierA" | "tierB" | "tierC" | "tierD" } = {}
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

      // Determine rate limit based on tier and user subscription
      let limit: number;
      let key: string;

      if (options.tier) {
        // Use tiered rate limiting
        limit = calculateTieredLimit(
          options.tier,
          authContext.profile?.subscription_tier,
          authContext.profile?.account_type
        );
        key = generateTieredRateLimitKey(req, authContext, options.tier);
      } else {
        // Fall back to legacy rate limiting
        limit = options.customLimit || authContext.features.maxRequestsPerHour;
        key = options.keyGenerator ? 
          options.keyGenerator(req, authContext) : 
          generateRateLimitKey(req, authContext);
      }

      const windowMs = options.windowMs || 3600000; // 1 hour

      // Check rate limit using Redis
      const rateLimitResult = await checkRateLimit(key, limit, windowMs);
      
      logger.debug('Tiered rate limit check', {
        key,
        limit,
        tier: options.tier,
        allowed: rateLimitResult.allowed,
        remaining: rateLimitResult.remaining,
        userId: authContext.user?.id,
        subscriptionTier: authContext.profile?.subscription_tier,
        accountType: authContext.profile?.account_type,
        endpoint: new URL(req.url).pathname,
        totalRequests: rateLimitResult.totalRequests,
      });

      if (!rateLimitResult.allowed) {
        logger.warn('Tiered rate limit exceeded', {
          key,
          limit,
          tier: options.tier,
          userId: authContext.user?.id,
          subscriptionTier: authContext.profile?.subscription_tier,
          accountType: authContext.profile?.account_type,
          endpoint: new URL(req.url).pathname,
          totalRequests: rateLimitResult.totalRequests,
        });

        const authError = createAuthError(
          AuthErrorCode.RATE_LIMIT_EXCEEDED,
          'Rate limit exceeded',
          `You have exceeded the rate limit of ${limit} requests per hour for this operation`,
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

      // Add rate limit headers to successful response with the correct tiered limit
      response.headers.set('X-RateLimit-Limit', limit.toString());
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());

      if (rateLimitResult.remaining === 0) {
        response.headers.set('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString());
      }

      return response;

    } catch (error) {
      logger.error('Tiered rate limiting middleware error:', error);
      
      // If rate limiting fails, allow the request to proceed
      logger.warn('Tiered rate limiting failed, allowing request to proceed');
      return await handler(req, authContext);
    }
  };
}
