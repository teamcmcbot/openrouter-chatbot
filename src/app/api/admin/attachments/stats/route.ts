// src/app/api/admin/attachments/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import type { AuthContext } from '../../../../../../lib/types/auth';
import { getAttachmentsStats } from '../../../../../../lib/services/attachmentsStats';
import { logger } from '../../../../../../lib/utils/logger';

async function handler(_req: NextRequest, _ctx: AuthContext) {
  try {
  void _req; void _ctx;
    const stats = await getAttachmentsStats();
    const res = NextResponse.json({ success: true, stats });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin attachments stats failed', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const GET = withAdminAuth(handler);
