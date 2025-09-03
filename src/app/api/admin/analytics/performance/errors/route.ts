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
    const segment = (searchParams.get('segment') || 'authenticated').toLowerCase();

    const useAnonymous = segment === 'anonymous';
    const { data, error } = useAnonymous
      ? await supabase.rpc('get_anonymous_errors', { p_start_date: startISO, p_end_date: endISO, p_limit: limit })
      : await supabase.rpc('get_recent_errors', {
          p_start_date: startISO,
          p_end_date: endISO,
          p_limit: limit
        });
    if (error) throw error;

    // Normalize anonymous rows to the shape expected by the UI
    let rows = data || [];
    if (useAnonymous) {
      type AnonRow = { id: string; event_timestamp: string; model: string | null; error_message: string | null; completion_id: string | null };
      rows = (rows as AnonRow[]).map((r) => ({
        // UI expects these fields from authenticated errors; many will be null for anon
        message_id: r.id,
        session_id: null,
        user_id: null,
        model: r.model,
        message_timestamp: r.event_timestamp,
        error_message: r.error_message,
        completion_id: r.completion_id,
        user_message_id: null,
        elapsed_ms: null
      }));
    }

    return NextResponse.json({ ok: true, range: { start: startISO, end: endISO }, errors: rows });
  } catch (err) {
    logger.error('admin.analytics.performance.errors error', err);
    return handleError(err);
  }
}

export const GET = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierC' }));
