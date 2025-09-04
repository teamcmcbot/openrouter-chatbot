import { NextRequest } from 'next/server';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { handleError } from '../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

async function handler(req: NextRequest) {
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  try {
    throw new Error('Intentional debug error');
  } catch (e) {
    return handleError(e, requestId, '/api/debug/error');
  }
}

export const GET = withEnhancedAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
export const POST = GET;
