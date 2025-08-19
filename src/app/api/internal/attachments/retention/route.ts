import { NextRequest, NextResponse } from 'next/server';
import { withInternalCleanupAuth } from '../../../../../../lib/middleware/internalAuth';
import { cleanupRetentionByTier, RetentionRunParams } from '../../../../../../lib/services/attachmentsRetention';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const runtime = 'nodejs';

export const POST = withInternalCleanupAuth(async (req: NextRequest): Promise<NextResponse> => {
  const start = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<RetentionRunParams> & {
      daysByTier?: Partial<Record<'free' | 'pro' | 'enterprise', number>>;
    };

    const params: RetentionRunParams = {
      daysByTier: body.daysByTier,
      limit: typeof body.limit === 'number' ? Math.max(1, Math.min(body.limit, 5000)) : 1000,
      dryRun: Boolean(body.dryRun),
    };

    logger.info('Internal retention cleanup called', params);

    const result = await cleanupRetentionByTier(params);
    const responseTime = Date.now() - start;

    return NextResponse.json(
      { success: true, data: result, triggeredAt: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Response-Time': responseTime.toString() } }
    );
  } catch (error) {
    const responseTime = Date.now() - start;
    const err = handleError(error);
    err.headers.set('X-Response-Time', responseTime.toString());
    return err;
  }
});

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } });
}
