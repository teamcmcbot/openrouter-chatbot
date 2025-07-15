/**
 * Server-side model configuration cache initialization
 * 
 * This script preloads model configurations into memory to reduce latency
 * on the first chat API requests after server startup.
 */

import { preloadModelConfigs, getServerCacheStats } from '../lib/utils/tokens';
import { logger } from '../lib/utils/logger';

/**
 * Initialize server-side caches
 */
export async function initializeServerCaches(): Promise<void> {
  try {
    logger.info('[Server Init] Starting server-side cache initialization...');
    
    // Preload model configurations
    await preloadModelConfigs();
    
    // Log cache statistics
    const stats = getServerCacheStats();
    logger.info('[Server Init] Model configurations cache initialized', {
      configCount: stats.configCount,
      isInitialized: stats.isInitialized,
    });
    
    logger.info('[Server Init] Server-side cache initialization completed successfully');
    
  } catch (error) {
    logger.error('[Server Init] Failed to initialize server-side caches:', error);
    // Don't throw - server should still start even if cache init fails
  }
}

/**
 * Get current cache status for health checks
 */
export function getCacheHealthStatus(): {
  modelConfigs: {
    status: 'healthy' | 'stale' | 'uninitialized';
    details: ReturnType<typeof getServerCacheStats>;
  };
} {
  const modelStats = getServerCacheStats();
  
  let status: 'healthy' | 'stale' | 'uninitialized';
  if (!modelStats.isInitialized) {
    status = 'uninitialized';
  } else if (modelStats.isExpired) {
    status = 'stale';
  } else {
    status = 'healthy';
  }
  
  return {
    modelConfigs: {
      status,
      details: modelStats,
    },
  };
}
