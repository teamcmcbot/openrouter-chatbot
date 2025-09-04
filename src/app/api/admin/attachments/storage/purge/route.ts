// src/app/api/admin/attachments/storage/purge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import type { AuthContext } from '../../../../../../../lib/types/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { purgeStorageOnlyOrphans } from '../../../../../../../lib/services/attachmentsStorage';
import { logger } from '../../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../../lib/utils/headers';

async function handler(req: NextRequest, ctx: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === 'true' || searchParams.get('dry') === 'true' || req.method === 'GET';
    const olderThanHours = Math.max(1, parseInt(searchParams.get('olderThanHours') || '24', 10));
    const limit = Math.max(1, Math.min(2000, parseInt(searchParams.get('limit') || '500', 10)));
  const actor = ctx?.user?.id ?? 'unknown';

  logger.infoOrDebug('admin.attachments.storage.purge.start', { requestId, route: '/api/admin/attachments/storage/purge', ctx: { actor, dryRun, olderThanHours, limit, method: req.method } });

    const result = await purgeStorageOnlyOrphans({ dryRun, olderThanHours, limit });
    const res = NextResponse.json({ ...result, olderThanHours, limit }, { headers: { 'x-request-id': requestId } });
  logger.infoOrDebug('admin.attachments.storage.purge.complete', { requestId, route: '/api/admin/attachments/storage/purge', ctx: { durationMs: Date.now() - t0, dryRun, olderThanHours, limit, success: result.success } });
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('admin.attachments.storage.purge.fail', { requestId, route: '/api/admin/attachments/storage/purge', ctx: { error: msg } });
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}

export const POST = withAdminAuth(
  withTieredRateLimit(handler, { tier: 'tierB' })
);
export const GET = withAdminAuth(
  withTieredRateLimit(handler, { tier: 'tierB' })
);
