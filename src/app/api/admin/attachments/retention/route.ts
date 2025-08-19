// src/app/api/admin/attachments/retention/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import type { AuthContext } from '../../../../../../lib/types/auth';
import { cleanupRetentionByTier } from '../../../../../../lib/services/attachmentsRetention';
import { logger } from '../../../../../../lib/utils/logger';

async function handler(req: NextRequest, _ctx: AuthContext) {
  try {
    void _ctx;
    const { searchParams } = new URL(req.url);

    const freeDays = parseInt(searchParams.get('freeDays') || '', 10);
    const proDays = parseInt(searchParams.get('proDays') || '', 10);
    const entDays = parseInt(searchParams.get('enterpriseDays') || '', 10);

    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '1000', 10) || 1000, 5000));
    const dryRun = (searchParams.get('dryRun') || '').toLowerCase() === 'true';

    const daysByTier: Record<'free' | 'pro' | 'enterprise', number> = {
      free: Number.isFinite(freeDays) && freeDays > 0 ? freeDays : 30,
      pro: Number.isFinite(proDays) && proDays > 0 ? proDays : 60,
      enterprise: Number.isFinite(entDays) && entDays > 0 ? entDays : 90,
    };

    const result = await cleanupRetentionByTier({ daysByTier, limit, dryRun });

    const res = NextResponse.json({ success: true, params: { daysByTier, limit, dryRun }, result });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin retention cleanup failed', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withAdminAuth(handler);
export const GET = withAdminAuth(handler);
