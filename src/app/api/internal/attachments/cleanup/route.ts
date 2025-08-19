import { NextRequest, NextResponse } from 'next/server';
import { withInternalCleanupAuth } from '../../../../../../lib/middleware/internalAuth';
import { cleanupOrphanImageAttachments } from '../../../../../../lib/services/attachmentsCleanup';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const runtime = 'nodejs';

type CleanupBody = {
  hours?: number;
  limit?: number;
  dryRun?: boolean;
  source?: string;
};

export const POST = withInternalCleanupAuth(async (req: NextRequest): Promise<NextResponse> => {
  const start = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as CleanupBody;
    const hours = typeof body.hours === 'number' && body.hours > 0 ? body.hours : 24;
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 1000) : 500;
    const dryRun = Boolean(body.dryRun);
    const source = body.source || 'internal';

    logger.info('Internal attachments cleanup called', { hours, limit, dryRun, source });

    // TODO: Optional: add DB-based concurrency check/lock here like sync-models

    if (dryRun) {
      // For dryRun, return only counts that would be scanned (best-effort quick estimate)
      // Note: Using the actual service would perform deletions, so we avoid it here.
      // We can future-enhance to add a count-only service.
      const responseTime = Date.now() - start;
      return NextResponse.json(
        {
          success: true,
          dryRun: true,
          data: {
            note: 'Dry-run does not modify data. Implement count-only service for precise numbers if needed.',
            hours,
            limit,
            source,
          },
        },
        { status: 200, headers: { 'X-Response-Time': responseTime.toString(), 'X-Items-Processed': '0' } }
      );
    }

    const result = await cleanupOrphanImageAttachments(hours, limit);
    const responseTime = Date.now() - start;

    // Best-effort custom headers
    const headers: Record<string, string> = {
      'X-Response-Time': responseTime.toString(),
      'X-Items-Processed': (result.deletedStorage || 0).toString(),
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          scanned: result.scanned,
          deletedStorage: result.deletedStorage,
          softDeletedRows: result.softDeletedRows,
          sampleIds: result.sampleIds,
          errors: result.errors,
          triggeredBy: 'internal',
          source,
          triggeredAt: new Date().toISOString(),
        },
      },
      { status: 200, headers }
    );
  } catch (error) {
    const responseTime = Date.now() - start;
    logger.error('Error in internal attachments cleanup endpoint:', error);
    const err = handleError(error);
    err.headers.set('X-Response-Time', responseTime.toString());
    return err;
  }
});

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        Allow: 'POST, OPTIONS',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature',
      },
    }
  );
}
