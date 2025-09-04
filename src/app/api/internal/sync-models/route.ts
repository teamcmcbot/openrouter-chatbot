// src/app/api/internal/sync-models/route.ts
import { NextResponse } from 'next/server';
import { withInternalAuth } from '../../../../../lib/middleware/internalAuth';
import { modelSyncService } from '../../../../../lib/services/modelSyncService';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs'; // ensure Node crypto available if needed

export const POST = withInternalAuth(async (): Promise<NextResponse> => {
  const start = Date.now();
  try {
    logger.info('Internal sync-models endpoint called');

    // Note: body parsing not required; avoid consuming body unless needed for HMAC

    // Concurrency check
    const running = await modelSyncService.isSyncRunning();
    if (running) {
      const responseTime = Date.now() - start;
      logger.warn('Internal sync rejected: already running');
      return NextResponse.json(
        {
          success: false,
          error: 'Sync already in progress',
          code: 'CONFLICT',
          message: 'A model synchronization is already in progress.'
        },
        { status: 409, headers: { 'X-Response-Time': responseTime.toString() } }
      );
    }

    // Trigger sync (no user attribution for internal)
    const result = await modelSyncService.syncModels(undefined);
    const responseTime = Date.now() - start;

    if (result.success) {
      // Best-effort audit log (internal)
      try {
        const supabase = await createClient();
        await supabase.rpc('write_admin_audit', {
          p_actor_user_id: null,
          p_action: 'sync.scheduled',
          p_target: 'model_access',
          p_payload: {
            syncLogId: result.syncLogId,
            totalProcessed: result.totalProcessed,
            modelsAdded: result.modelsAdded,
            modelsUpdated: result.modelsUpdated,
            modelsMarkedInactive: result.modelsMarkedInactive,
            durationMs: result.durationMs,
          },
        });
      } catch (auditErr) {
        logger.warn('Audit log write failed for internal sync success', auditErr);
      }
      logger.info('Internal sync completed', {
        syncLogId: result.syncLogId,
        totalProcessed: result.totalProcessed,
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            syncLogId: result.syncLogId,
            totalProcessed: result.totalProcessed,
            modelsAdded: result.modelsAdded,
            modelsUpdated: result.modelsUpdated,
            modelsMarkedInactive: result.modelsMarkedInactive,
            durationMs: result.durationMs,
            triggeredBy: 'internal',
            triggeredAt: new Date().toISOString(),
          }
        },
        {
          status: 200,
          headers: {
            'X-Response-Time': responseTime.toString(),
            'X-Sync-Log-ID': result.syncLogId,
            'X-Models-Processed': result.totalProcessed.toString(),
          }
        }
      );
    }

    // failure path
    logger.error('Internal sync failed', { errors: result.errors });
    try {
      const supabase = await createClient();
      await supabase.rpc('write_admin_audit', {
        p_actor_user_id: null,
        p_action: 'sync.scheduled_failed',
        p_target: 'model_access',
        p_payload: {
          syncLogId: result.syncLogId,
          durationMs: result.durationMs,
          errors: result.errors,
        },
      });
    } catch (auditErr) {
      logger.warn('Audit log write failed for internal sync failure', auditErr);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Model synchronization failed',
        code: 'SYNC_FAILED',
        message: 'The model synchronization process encountered errors',
        data: {
          syncLogId: result.syncLogId,
          durationMs: result.durationMs,
          errors: result.errors,
          triggeredBy: 'internal',
          triggeredAt: new Date().toISOString(),
        }
      },
      { status: 500 }
    );
  } catch (error) {
    const responseTime = Date.now() - start;
    logger.error('Error in internal sync endpoint:', error);
  const err = handleError(error, undefined, '/api/internal/sync-models');
    err.headers.set('X-Response-Time', responseTime.toString());
    return err;
  }
});

export async function OPTIONS() {
  return NextResponse.json(
    {},
    { status: 200, headers: { Allow: 'POST, OPTIONS', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature' } }
  );
}
