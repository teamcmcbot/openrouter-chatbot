      const isRpcResponse = (val: unknown): val is { success?: boolean; error?: string } =>
        !!val && typeof val === 'object' && ('success' in (val as Record<string, unknown>) || 'error' in (val as Record<string, unknown>));
// src/app/api/admin/model-access/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../lib/middleware/auth';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { logger } from '../../../../../lib/utils/logger';

type StatusType = 'new' | 'active' | 'disabled' | 'inactive' | string;

// GET: list model_access rows with optional status filter
async function getHandler(req: NextRequest, _ctx: AuthContext) {
  try {
  void _ctx;
    const { searchParams } = new URL(req.url);
    const meta = searchParams.get('meta');
    // Meta: return distinct statuses
    if (meta === 'statuses') {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('model_access')
        .select('status')
        .not('status', 'is', null)
        .range(0, 9999);
      if (error) {
        logger.error('Error fetching distinct statuses', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const statuses = Array.from(new Set((data || []).map((r: { status: string }) => r.status))).sort();
      return NextResponse.json({ success: true, statuses });
    }
  // Default to 'all' so no filter is applied unless explicitly requested
  const statusParam = (searchParams.get('status') || 'all').toLowerCase();
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const supabase = await createClient();

    let query = supabase
      .from('model_access')
      .select(
        `model_id, canonical_slug, model_name, status, is_free, is_pro, is_enterprise, context_length, last_synced_at, updated_at, created_at`,
        { count: 'exact' }
      )
  .order('created_at', { ascending: false })
      .range(offset, Math.max(offset + limit - 1, offset));

    // Apply status filter for any provided status except 'all'
    if (statusParam && statusParam !== 'all') {
      query = query.eq('status', statusParam as StatusType);
    }

    const [{ data, error, count: filteredCount }, totalCountRes] = await Promise.all([
      query,
      supabase.from('model_access').select('model_id', { count: 'exact', head: true })
    ]);
    if (error) {
      logger.error('Error fetching model_access rows', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

  const totalCount = totalCountRes.count ?? null;
  return NextResponse.json({ success: true, items: data ?? [], totalCount, filteredCount: filteredCount ?? (data?.length || 0) });
  } catch (err) {
    logger.error('Unhandled GET /admin/model-access error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

type UpdateItem = {
  model_id: string;
  status?: StatusType;
  is_free?: boolean;
  is_pro?: boolean;
  is_enterprise?: boolean;
};

// PATCH: batch update flags/status for specific rows
async function patchHandler(req: NextRequest, ctx: AuthContext) {
  try {
  // actor context available via withAdminAuth
    const body = (await req.json()) as { updates?: UpdateItem[] } | null;
    const updates = body?.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
    }

    const supabase = await createClient();
    const results: Array<{ model_id: string; success: boolean; error?: string }> = [];

    for (const u of updates) {
      const { model_id, status, is_free, is_pro, is_enterprise } = u;
      if (!model_id) {
        results.push({ model_id: '', success: false, error: 'Missing model_id' });
        continue;
      }

      // Nothing to update? skip with message
      if (
        typeof status !== 'string' &&
        typeof is_free !== 'boolean' &&
        typeof is_pro !== 'boolean' &&
        typeof is_enterprise !== 'boolean'
      ) {
        results.push({ model_id, success: false, error: 'No valid fields to update' });
        continue;
      }

      // Use SECURITY DEFINER RPC to bypass RLS safely
      const { data, error } = await supabase.rpc('update_model_tier_access', {
        p_model_id: model_id,
        p_is_free: typeof is_free === 'boolean' ? is_free : null,
        p_is_pro: typeof is_pro === 'boolean' ? is_pro : null,
        p_is_enterprise: typeof is_enterprise === 'boolean' ? is_enterprise : null,
        p_status: typeof status === 'string' ? status : null,
      });

      if (error) {
        results.push({ model_id, success: false, error: error.message });
      } else if (isRpcResponse(data) && data.success === false) {
        const errMsg = data.error || 'RPC failed';
        results.push({ model_id, success: false, error: errMsg });
      } else {
        results.push({ model_id, success: true });
      }
    }

    const okCount = results.filter(r => r.success).length;

    // Write admin audit log (best-effort; non-blocking)
    try {
      if (okCount > 0 && ctx.user?.id) {
        await supabase.rpc('write_admin_audit', {
          p_actor_user_id: ctx.user.id,
          p_action: 'models.bulk_update',
          p_target: 'model_access',
          p_payload: { results },
        });
      }
    } catch (auditErr) {
      logger.warn('Audit log write failed for /admin/model-access PATCH', auditErr);
    }
    const status = okCount === results.length ? 200 : okCount > 0 ? 207 : 400;
    return NextResponse.json({ success: okCount > 0, results }, { status });
  } catch (err) {
    logger.error('Unhandled PATCH /admin/model-access error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAdminAuth(getHandler);
export const PATCH = withAdminAuth(patchHandler);

// Extra: GET /api/admin/model-access?statuses=1 → returns distinct statuses
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
