import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../../lib/types/auth';
import { createClient } from '../../../../../../../lib/supabase/server';
import { resolveDateRange } from '../../../../../../../lib/utils/usageCosts';
import { logger } from '../../../../../../../lib/utils/logger';
import { handleError } from '../../../../../../../lib/utils/errors';

export const dynamic = 'force-dynamic';

function toISODate(d: Date): string { return d.toISOString().slice(0,10); }

async function handler(req: NextRequest, _auth: AuthContext) {
  try {
  void _auth;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(searchParams);
    const startISO = toISODate(range.start);
    const endISO = toISODate(range.end);
    const limit = Number(searchParams.get('limit') || 100);

    const { data, error } = await supabase.rpc('get_recent_errors', {
      p_start_date: startISO,
      p_end_date: endISO,
      p_limit: limit
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, range: { start: startISO, end: endISO }, errors: data || [] });
  } catch (err) {
    logger.error('admin.analytics.performance.errors error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
