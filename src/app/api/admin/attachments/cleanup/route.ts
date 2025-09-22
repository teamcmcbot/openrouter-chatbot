// src/app/api/admin/attachments/cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { AuthContext } from '../../../../../../lib/types/auth';
import { cleanupOrphanImageAttachments } from '../../../../../../lib/services/attachmentsCleanup';
import { logger } from '../../../../../../lib/utils/logger';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, ctx: AuthContext) {
  try {
    void ctx;
    const { searchParams } = new URL(req.url);
    const hours = Math.max(1, Math.min(168, parseInt(searchParams.get('hours') || '24', 10) || 24)); // clamp 1..168
    const limit = Math.max(1, Math.min(2000, parseInt(searchParams.get('limit') || '500', 10) || 500));

    const result = await cleanupOrphanImageAttachments(hours, limit);

    // Respond with summary and rate-limit style hints
    const res = NextResponse.json({ success: true, hours, limit, result });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin orphan cleanup failed', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withAdminAuth(handler);
export const GET = withAdminAuth(handler);
