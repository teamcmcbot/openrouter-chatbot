// src/app/api/admin/users/[id]/ban/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../../lib/types/auth';
import { createClient } from '../../../../../../../lib/supabase/server';
import { logger } from '../../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../../lib/utils/headers';
import { deleteAuthSnapshot } from '../../../../../../../lib/utils/authSnapshot';

type BanBody = { until?: string | null; reason?: string | null };

async function handler(req: NextRequest, ctx: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
  const url = new URL(req.url);
  const id = url.pathname.split('/').slice(-2)[0]; // .../users/{id}/ban

  try {
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing user id' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    // Prevent self-ban from UI mishaps
    if (ctx.user?.id === id) {
      return NextResponse.json({ success: false, error: 'Cannot ban your own account' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    const body = (await req.json().catch(() => ({}))) as BanBody;
    const reason = (body.reason || '').trim();
    const untilIso = body.until ? String(body.until) : null;

    // Minimal validation
    if (!reason || reason.length < 3) {
      return NextResponse.json({ success: false, error: 'Reason required' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    let until: string | null = null;
    if (untilIso) {
      const ts = Date.parse(untilIso);
      if (Number.isNaN(ts)) {
        return NextResponse.json({ success: false, error: 'Invalid until timestamp' }, { status: 400, headers: { 'x-request-id': requestId } });
      }
      until = new Date(ts).toISOString();
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('ban_user', {
      p_user_id: id,
      p_until: until,
      p_reason: reason,
    });

    if (error) {
      logger.error('admin.users.ban.rpc.fail', error, { requestId, route: '/api/admin/users/[id]/ban', ctx: { id } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: { 'x-request-id': requestId } });
    }

    // Invalidate auth snapshot cache for immediate enforcement
    await deleteAuthSnapshot(id).catch(() => {});

    logger.infoOrDebug('admin.users.ban.ok', { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, durationMs: Date.now() - t0 } });
    return NextResponse.json({ success: true, result: data }, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    logger.error('admin.users.ban.unhandled', err, { requestId, route: '/api/admin/users/[id]/ban' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}

export const POST = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierD' }));
export async function OPTIONS() { return NextResponse.json({}, { status: 200 }); }
