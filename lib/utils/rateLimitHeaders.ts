// lib/utils/rateLimitHeaders.ts

import { NextResponse } from 'next/server';
import { AuthContext } from '../types/auth';

/**
 * Rate limiting headers helper
 */
export function addRateLimitHeaders(
  response: NextResponse,
  authContext: AuthContext,
  remaining: number = 0
): NextResponse {
  const rateLimitInfo = {
    limit: authContext.features.maxRequestsPerHour,
    remaining,
    reset: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
  };

  response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimitInfo.reset);

  if (remaining === 0) {
    response.headers.set('Retry-After', '3600'); // 1 hour
  }

  return response;
}
