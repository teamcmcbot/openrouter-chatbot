// lib/middleware/rateLimitMiddleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { AuthContext, AuthErrorCode } from '../types/auth';
import { createAuthError, handleAuthError } from '../utils/errors';
import { logger } from '../utils/logger';
import { addRateLimitHeaders } from './auth';

/**
 * Simple in-memory rate limiter for development
 * In production, this should be replaced with Redis-based rate limiting
 */
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly windowMs = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Check if request is within rate limit
   */
  checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Clean up old entries
    this.cleanup(windowStart);
    
    const entry = this.requests.get(key);
    
    if (!entry) {
      // First request for this key
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: limit - 1, resetTime: now + this.windowMs };
    }
    
    if (now > entry.resetTime) {
      // Window has expired, reset counter
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: limit - 1, resetTime: now + this.windowMs };
    }
    
    if (entry.count >= limit) {
      // Rate limit exceeded
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }
    
    // Increment counter
    entry.count++;
    this.requests.set(key, entry);
    
    return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(windowStart: number): void {
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetTime < windowStart) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Get current stats for debugging
   */
  getStats(): { totalKeys: number; activeRequests: number } {
    const now = Date.now();
    let activeRequests = 0;
    
    for (const entry of this.requests.values()) {
      if (entry.resetTime > now) {
        activeRequests += entry.count;
      }
    }
    
    return {
      totalKeys: this.requests.size,
      activeRequests
    };
  }
}

// Global rate limiter instance
const rateLimiter = new InMemoryRateLimiter();

/**
 * Rate limiting middleware options
 */
export interface RateLimitOptions {
  /**
   * Custom rate limit override (for testing or special cases)
   */
  customLimit?: number;
  
  /**
   * Whether to skip rate limiting (for bypass users)
   */
  skipRateLimit?: boolean;
  
  /**
   * Custom key generator function
   */
  keyGenerator?: (request: NextRequest, authContext: AuthContext) => string;
}

/**
 * Generate rate limit key based on user or IP
 */
function generateRateLimitKey(request: NextRequest, authContext: AuthContext): string {
  if (authContext.isAuthenticated && authContext.user) {
    // Use user ID for authenticated users
    return `user:${authContext.user.id}`;
  }
  
  // Use IP address for anonymous users
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limiting middleware
 */
export function withRateLimit<T extends NextRequest>(
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

      // Determine rate limit
      const limit = options.customLimit || authContext.features.maxRequestsPerHour;
      
      // Generate rate limit key
      const key = options.keyGenerator ? 
        options.keyGenerator(req, authContext) : 
        generateRateLimitKey(req, authContext);

      // Check rate limit
      const rateLimitResult = rateLimiter.checkRateLimit(key, limit);
      
      logger.debug('Rate limit check', {
        key,
        limit,
        allowed: rateLimitResult.allowed,
        remaining: rateLimitResult.remaining,
        userId: authContext.user?.id
      });

      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          key,
          limit,
          userId: authContext.user?.id,
          tier: authContext.profile?.subscription_tier
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
 * Global rate limiting middleware (applies to all requests regardless of auth)
 */
export function withGlobalRateLimit<T extends NextRequest>(
  handler: (req: T) => Promise<NextResponse>,
  globalLimit: number = 1000 // requests per minute
) {
  const globalLimiter = new InMemoryRateLimiter();
  
  return async (req: T): Promise<NextResponse> => {
    try {
      // Use a global key for all requests
      const key = 'global';
      const rateLimitResult = globalLimiter.checkRateLimit(key, globalLimit);
      
      if (!rateLimitResult.allowed) {
        logger.warn('Global rate limit exceeded', { globalLimit });
        
        return NextResponse.json(
          {
            error: 'Service temporarily unavailable due to high traffic',
            code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
            retryable: true,
            timestamp: new Date().toISOString()
          },
          { 
            status: 503,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': globalLimit.toString(),
              'X-RateLimit-Remaining': '0'
            }
          }
        );
      }

      return await handler(req);
      
    } catch (error) {
      logger.error('Global rate limiting error:', error);
      // Allow request to proceed if rate limiting fails
      return await handler(req);
    }
  };
}

/**
 * Get rate limiter statistics (for monitoring)
 */
export function getRateLimiterStats() {
  return rateLimiter.getStats();
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter() {
  rateLimiter['requests'].clear();
}