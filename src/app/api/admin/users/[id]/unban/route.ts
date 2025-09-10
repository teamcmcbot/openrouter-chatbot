// src/app/api/admin/users/[id]/unban/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../../lib/types/auth';
import { createClient } from '../../../../../../../lib/supabase/server';
import { logger } from '../../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../../lib/utils/headers';
import { deleteAuthSnapshot } from '../../../../../../../lib/utils/authSnapshot';

type UnbanBody = { reason?: string | null };

async function handler(req: NextRequest, ctx: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
  const url = new URL(req.url);
  void ctx;
  const id = url.pathname.split('/').slice(-2)[0]; // .../users/{id}/unban

  try {
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing user id' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    const body = (await req.json().catch(() => ({}))) as UnbanBody;
    const reason = (body.reason || '').trim() || null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('unban_user', {
      p_user_id: id,
      p_reason: reason,
    });

    if (error) {
      logger.error('admin.users.unban.rpc.fail', error, { requestId, route: '/api/admin/users/[id]/unban', ctx: { id } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: { 'x-request-id': requestId } });
    }

    // Invalidate auth snapshot cache for immediate effect
    await deleteAuthSnapshot(id).catch(() => {});

    logger.infoOrDebug('admin.users.unban.ok', { requestId, route: '/api/admin/users/[id]/unban', ctx: { id, durationMs: Date.now() - t0 } });
    return NextResponse.json({ success: true, result: data }, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    logger.error('admin.users.unban.unhandled', err, { requestId, route: '/api/admin/users/[id]/unban' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}

export const POST = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierD' }));
export async function OPTIONS() { return NextResponse.json({}, { status: 200 }); }
