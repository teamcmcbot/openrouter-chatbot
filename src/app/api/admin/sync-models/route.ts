// src/app/api/admin/sync-models/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { modelSyncService } from '../../../../../lib/services/modelSyncService';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';
import { withAdminAuth } from '../../../../../lib/middleware/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { AuthContext } from '../../../../../lib/types/auth';

// Rate limiting configuration
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastSyncAttempts = new Map<string, number>();

/**
 * POST /api/admin/sync-models
 * 
 * Manually trigger model synchronization from OpenRouter API
 * Requires admin authentication
 */
async function postSyncHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    logger.info('Admin sync-models endpoint called');
    
    // Step 1: Check authentication (middleware already handles this)
    if (!authContext.isAuthenticated) {
      logger.warn('Unauthenticated request to admin sync endpoint');
      return NextResponse.json(
        { 
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          message: 'You must be signed in to access this endpoint'
        },
        { status: 401 }
      );
    }

  // Step 2: Admin authorization handled by withAdminAuth middleware

    const userId = authContext.user!.id;
    logger.info(`Admin sync request from user: ${userId}`);

    // Step 2: Rate limiting and cooldown check
    const now = Date.now();
    const lastAttempt = lastSyncAttempts.get(userId) || 0;
    const timeSinceLastAttempt = now - lastAttempt;

    if (timeSinceLastAttempt < SYNC_COOLDOWN_MS) {
      const remainingCooldown = Math.ceil((SYNC_COOLDOWN_MS - timeSinceLastAttempt) / 1000);
      logger.warn(`Sync cooldown active for user ${userId}, ${remainingCooldown}s remaining`);
      
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          code: 'TOO_MANY_REQUESTS',
          message: `Please wait ${remainingCooldown} seconds before triggering another sync`,
          retryAfter: remainingCooldown
        },
        { 
          status: 429,
          headers: {
            'Retry-After': remainingCooldown.toString(),
            'X-RateLimit-Reset': Math.ceil((now + (SYNC_COOLDOWN_MS - timeSinceLastAttempt)) / 1000).toString()
          }
        }
      );
    }

    // Step 3: Check if sync is already running
    const isSyncRunning = await modelSyncService.isSyncRunning();
    if (isSyncRunning) {
      logger.warn('Sync already running, rejecting new sync request');
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          code: 'CONFLICT',
          message: 'A model synchronization is already in progress. Please wait for it to complete.'
        },
        { status: 409 }
      );
    }

    // Step 4: Update rate limiting tracker
    lastSyncAttempts.set(userId, now);

    // Step 5: Get last sync status for context
    const lastSyncStatus = await modelSyncService.getLastSyncStatus();

    // Step 6: Trigger the sync
    logger.info('Starting manual model sync');
  const syncResult = await modelSyncService.syncModels(userId);

    const responseTime = Date.now() - startTime;

    if (syncResult.success) {
      // Audit success
      try {
        const supabase = await createClient();
        await supabase.rpc('write_admin_audit', {
          p_actor_user_id: userId,
          p_action: 'sync.manual_trigger',
          p_target: 'model_access',
          p_payload: {
            syncLogId: syncResult.syncLogId,
            totalProcessed: syncResult.totalProcessed,
            modelsAdded: syncResult.modelsAdded,
            modelsUpdated: syncResult.modelsUpdated,
            modelsMarkedInactive: syncResult.modelsMarkedInactive,
            durationMs: syncResult.durationMs,
          },
        });
      } catch (auditErr) {
        logger.warn('Audit log write failed for manual sync success', auditErr);
      }
      logger.info(`Manual sync completed successfully in ${responseTime}ms`, {
        syncLogId: syncResult.syncLogId,
        totalProcessed: syncResult.totalProcessed,
        modelsAdded: syncResult.modelsAdded,
        modelsUpdated: syncResult.modelsUpdated,
        modelsMarkedInactive: syncResult.modelsMarkedInactive,
        userId
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Model synchronization completed successfully',
          data: {
            syncLogId: syncResult.syncLogId,
            totalProcessed: syncResult.totalProcessed,
            modelsAdded: syncResult.modelsAdded,
            modelsUpdated: syncResult.modelsUpdated,
            modelsMarkedInactive: syncResult.modelsMarkedInactive,
            durationMs: syncResult.durationMs,
            triggeredBy: userId,
            triggeredAt: new Date().toISOString()
          },
          previousSync: {
            lastSyncAt: lastSyncStatus.lastSyncAt?.toISOString() || null,
            lastSyncStatus: lastSyncStatus.lastSyncStatus,
            lastSyncDuration: lastSyncStatus.lastSyncDuration
          }
        },
        {
          status: 200,
          headers: {
            'X-Response-Time': responseTime.toString(),
            'X-Sync-Log-ID': syncResult.syncLogId,
            'X-Models-Processed': syncResult.totalProcessed.toString()
          }
        }
      );
    } else {
      // Audit failure
      try {
        const supabase = await createClient();
        await supabase.rpc('write_admin_audit', {
          p_actor_user_id: userId,
          p_action: 'sync.manual_trigger_failed',
          p_target: 'model_access',
          p_payload: {
            syncLogId: syncResult.syncLogId,
            durationMs: syncResult.durationMs,
            errors: syncResult.errors,
          },
        });
      } catch (auditErr) {
        logger.warn('Audit log write failed for manual sync failure', auditErr);
      }
      logger.error('Manual sync failed', {
        syncLogId: syncResult.syncLogId,
        errors: syncResult.errors,
        userId
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Model synchronization failed',
          code: 'SYNC_FAILED',
          message: 'The model synchronization process encountered errors',
          data: {
            syncLogId: syncResult.syncLogId,
            durationMs: syncResult.durationMs,
            errors: syncResult.errors,
            triggeredBy: userId,
            triggeredAt: new Date().toISOString()
          }
        },
        { 
          status: 500,
          headers: {
            'X-Response-Time': responseTime.toString(),
            'X-Sync-Log-ID': syncResult.syncLogId
          }
        }
      );
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in admin sync endpoint:', error);
    
    const errorResponse = handleError(error);
    // Add custom headers to the error response
    errorResponse.headers.set('X-Response-Time', responseTime.toString());
    return errorResponse;
  }
}

/**
 * GET /api/admin/sync-models
 * 
 * Get sync status and statistics
 * Requires admin authentication
 */
async function getSyncStatusHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    logger.info('Admin sync-models status endpoint called', {
      userId: authContext.user?.id,
      url: request.url
    });
    
  // Authorization is handled by withAdminAuth middleware; do not gate by subscription_tier here
  // Step 1: Get sync status and statistics
    const [lastSyncStatus, syncStats, isSyncRunning] = await Promise.all([
      modelSyncService.getLastSyncStatus(),
      modelSyncService.getSyncStatistics(7), // Last 7 days
      modelSyncService.isSyncRunning()
    ]);

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        data: {
          currentStatus: {
            isRunning: isSyncRunning,
            lastSyncAt: lastSyncStatus.lastSyncAt?.toISOString() || null,
            lastSyncStatus: lastSyncStatus.lastSyncStatus,
            lastSyncDuration: lastSyncStatus.lastSyncDuration,
            totalModels: lastSyncStatus.totalModels,
            errorMessage: lastSyncStatus.errorMessage
          },
          statistics: {
            period: '7 days',
            totalSyncs: syncStats.totalSyncs,
            successfulSyncs: syncStats.successfulSyncs,
            failedSyncs: syncStats.failedSyncs,
            successRate: syncStats.totalSyncs > 0 
              ? Math.round((syncStats.successfulSyncs / syncStats.totalSyncs) * 100) 
              : 0,
            averageDuration: syncStats.averageDuration,
            lastSuccessfulSync: syncStats.lastSuccessfulSync?.toISOString() || null
          },
          cooldown: {
            enabled: true,
            durationMs: SYNC_COOLDOWN_MS,
            durationMinutes: SYNC_COOLDOWN_MS / (60 * 1000)
          }
        }
      },
      {
        status: 200,
        headers: {
          'X-Response-Time': responseTime.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in admin sync status endpoint:', error);
    
    const errorResponse = handleError(error);
    // Add custom headers to the error response
    errorResponse.headers.set('X-Response-Time', responseTime.toString());
    return errorResponse;
  }
}

/**
 * OPTIONS /api/admin/sync-models
 * 
 * CORS preflight handler
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Allow': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    }
  );
}

// Apply enhanced authentication middleware to both endpoints
export const POST = withAdminAuth(postSyncHandler);
export const GET = withAdminAuth(getSyncStatusHandler);
