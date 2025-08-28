// src/app/api/admin/attachments/storage/purge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import type { AuthContext } from '../../../../../../../lib/types/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { purgeStorageOnlyOrphans } from '../../../../../../../lib/services/attachmentsStorage';
import { logger } from '../../../../../../../lib/utils/logger';

async function handler(req: NextRequest, ctx: AuthContext) {
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === 'true' || searchParams.get('dry') === 'true' || req.method === 'GET';
    const olderThanHours = Math.max(1, parseInt(searchParams.get('olderThanHours') || '24', 10));
    const limit = Math.max(1, Math.min(2000, parseInt(searchParams.get('limit') || '500', 10)));
  const actor = ctx?.user?.id ?? 'unknown';

    logger.info('Admin storage purge requested', { actor, dryRun, olderThanHours, limit, method: req.method });

  const result = await purgeStorageOnlyOrphans({ dryRun, olderThanHours, limit });
  return NextResponse.json({ ...result, olderThanHours, limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin storage purge failed', { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withAdminAuth(
  withTieredRateLimit(handler, { tier: 'tierB' })
);
export const GET = withAdminAuth(
  withTieredRateLimit(handler, { tier: 'tierB' })
);
