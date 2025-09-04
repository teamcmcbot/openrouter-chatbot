import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../../lib/utils/headers';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, auth: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
  try {
    void auth;
    const supabase = await createClient();
    const [countsRes, recentRes] = await Promise.all([
      supabase.from('v_model_counts_public').select('*').limit(1),
      supabase
        .from('v_model_sync_activity_daily')
        .select('day, models_added, models_marked_inactive, models_reactivated')
        .order('day', { ascending: true })
    ]);

    const res = NextResponse.json({
      ok: true,
      counts: (countsRes.data && countsRes.data[0]) || { total_count: 0, new_count: 0, active_count: 0, inactive_count: 0, disabled_count: 0 },
  recent: recentRes.data || []
    }, { headers: { 'x-request-id': requestId } });

    {
      const lg = logger as { info?: (msg: string, ctx?: unknown) => void; debug: (msg: string, ctx?: unknown) => void };
      (lg.info ?? lg.debug)('admin.analytics.models.complete', {
        requestId,
        route: '/api/admin/analytics/models',
        ctx: { durationMs: Date.now() - t0 }
      });
    }
    return res;
  } catch (err) {
    logger.error('admin.analytics.models error', err, { requestId, route: '/api/admin/analytics/models' });
    return handleError(err, requestId);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
