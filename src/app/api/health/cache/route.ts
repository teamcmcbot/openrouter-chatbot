import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../lib/utils/logger';
import { getServerModelConfigsForTier } from '../../../../../lib/server/models';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

/**
 * Health check endpoint for server-side caches
 * GET /api/health/cache
 */
export async function GET(request: NextRequest) {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    // DB-backed model configs are the source of truth now
    // Use anonymous tier (same as free visibility) for a lightweight health probe
  const tier = 'anonymous' as const;
    const modelMap = await getServerModelConfigsForTier(tier);

    const configCount = Object.keys(modelMap || {}).length;
    const isHealthy = configCount > 0; // Healthy if we can fetch at least one active model config
    const httpStatus = isHealthy ? 200 : 503; // 503 if degraded/unavailable

    const response = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      caches: {
        modelConfigs: {
          status: isHealthy ? 'healthy' : 'degraded',
          details: {
            tier,
            configCount,
          },
        },
      },
    } as const;

  const durationMs = Date.now() - t0;
  logger.debug('[Health Check] Cache status (DB-backed) requested', { ...response, requestId, durationMs });

  return NextResponse.json(response, { status: httpStatus, headers: { 'x-request-id': requestId } });
    
  } catch (error) {
    logger.error('[Health Check] Error checking cache health:', error);
    
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to check cache health',
      },
      { status: 500, headers: { 'x-request-id': requestId } }
    );
  }
}
