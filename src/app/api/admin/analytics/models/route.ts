import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { logger } from '../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

async function handler(_req: NextRequest, auth: AuthContext) {
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

    return NextResponse.json({
      ok: true,
      counts: (countsRes.data && countsRes.data[0]) || { total_count: 0, new_count: 0, active_count: 0, inactive_count: 0, disabled_count: 0 },
  recent: recentRes.data || []
    });
  } catch (err) {
    logger.error('admin.analytics.models error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
