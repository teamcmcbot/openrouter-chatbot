// src/app/api/admin/attachments/storage/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import type { AuthContext } from '../../../../../../../lib/types/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { getStorageStats } from '../../../../../../../lib/services/attachmentsStorage';
import { logger } from '../../../../../../../lib/utils/logger';

async function handler(_req: NextRequest, _ctx: AuthContext) {
  try {
    void _req; void _ctx;
    const stats = await getStorageStats();
    const res = NextResponse.json({ success: true, stats });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin storage stats failed', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const GET = withAdminAuth(
  withTieredRateLimit(handler, { tier: 'tierB' })
);
