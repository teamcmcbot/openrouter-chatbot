import { NextResponse } from 'next/server';
import { logger } from '../../../../../lib/utils/logger';
import { getServerModelConfigsForTier } from '../../../../../lib/server/models';

/**
 * Health check endpoint for server-side caches
 * GET /api/health/cache
 */
export async function GET() {
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

    logger.debug('[Health Check] Cache status (DB-backed) requested', response);

    return NextResponse.json(response, { status: httpStatus });
    
  } catch (error) {
    logger.error('[Health Check] Error checking cache health:', error);
    
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to check cache health',
      },
      { status: 500 }
    );
  }
}
