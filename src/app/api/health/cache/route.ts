import { NextResponse } from 'next/server';
import { getCacheHealthStatus } from '../../../../../lib/server-init';
import { logger } from '../../../../../lib/utils/logger';

/**
 * Health check endpoint for server-side caches
 * GET /api/health/cache
 */
export async function GET() {
  try {
    const cacheStatus = getCacheHealthStatus();
    
    // Determine overall health
    const isHealthy = cacheStatus.modelConfigs.status === 'healthy';
    const httpStatus = isHealthy ? 200 : 503; // 503 Service Unavailable if caches are unhealthy
    
    const response = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      caches: cacheStatus,
    };
    
    logger.debug('[Health Check] Cache status requested', response);
    
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
