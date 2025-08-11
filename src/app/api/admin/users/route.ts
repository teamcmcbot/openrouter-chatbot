// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '../../../../../lib/middleware/auth';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { logger } from '../../../../../lib/utils/logger';

type Tier = 'free' | 'pro' | 'enterprise';
type AccountType = 'user' | 'admin';

type UserRow = {
  id: string;
  email: string;
  full_name?: string | null;
  subscription_tier: Tier;
  account_type: AccountType;
  credits: number;
  last_active?: string | null;
  updated_at?: string | null;
};

const isRpcResponse = (val: unknown): val is { success?: boolean; error?: string } =>
  !!val && typeof val === 'object' && ('success' in (val as Record<string, unknown>) || 'error' in (val as Record<string, unknown>));

// GET: list profiles with search, filters, pagination
async function getHandler(req: NextRequest, _ctx: AuthContext) {
  try {
    void _ctx;
    const { searchParams } = new URL(req.url);
    const meta = searchParams.get('meta');

    if (meta === 'filters') {
      return NextResponse.json({
        success: true,
        tiers: ['free', 'pro', 'enterprise'],
        account_types: ['user', 'admin'],
      });
    }

    const q = (searchParams.get('q') || '').trim();
    const tier = (searchParams.get('tier') || 'all').toLowerCase();
    const accountType = (searchParams.get('account_type') || 'all').toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const supabase = await createClient();

    let query = supabase
      .from('profiles')
      .select(
        'id, email, full_name, subscription_tier, account_type, credits, last_active, updated_at',
        { count: 'exact' }
      )
      .order('last_active', { ascending: false, nullsFirst: false });

    if (q) {
      // Search email or full_name
      // Supabase .or uses comma-separated filters
      query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
    }
    if (tier && tier !== 'all') {
      query = query.eq('subscription_tier', tier as Tier);
    }
    if (accountType && accountType !== 'all') {
      query = query.eq('account_type', accountType as AccountType);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const [{ data, error, count: filteredCount }, totalCountRes] = await Promise.all([
      query,
      supabase.from('profiles').select('id', { count: 'exact', head: true })
    ]);

    if (error) {
      logger.error('Error fetching profiles', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const totalCount = totalCountRes.count ?? null;
    return NextResponse.json({
      success: true,
      items: (data || []) as UserRow[],
      totalCount,
      filteredCount: filteredCount ?? (data?.length || 0),
    });
  } catch (err) {
    logger.error('Unhandled GET /admin/users error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

type UpdateItem = {
  id: string;
  subscription_tier?: Tier;
  account_type?: AccountType;
  credits?: number;
};

// PATCH: batch update tier, account_type, or credits
async function patchHandler(req: NextRequest, ctx: AuthContext) {
  try {
  // actor context available via withAdminAuth
    const body = (await req.json()) as { updates?: UpdateItem[] } | null;
    const updates = body?.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
    }

    const supabase = await createClient();
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const u of updates) {
      const { id, subscription_tier, account_type, credits } = u;
      if (!id) {
        results.push({ id: '', success: false, error: 'Missing id' });
        continue;
      }

      // Nothing to update? skip with message
      if (
        typeof subscription_tier !== 'string' &&
        typeof account_type !== 'string' &&
        typeof credits !== 'number'
      ) {
        results.push({ id, success: false, error: 'No valid fields to update' });
        continue;
      }

      // Validate values lightly
      if (subscription_tier && !['free', 'pro', 'enterprise'].includes(subscription_tier)) {
        results.push({ id, success: false, error: 'Invalid subscription_tier' });
        continue;
      }
      if (account_type && !['user', 'admin'].includes(account_type)) {
        results.push({ id, success: false, error: 'Invalid account_type' });
        continue;
      }

      try {
        // Apply tier change via RPC to ensure auditing consistency
        if (typeof subscription_tier === 'string') {
          const { data: tierData, error: tierErr } = await supabase.rpc('update_user_tier', {
            user_uuid: id,
            new_tier: subscription_tier
          });
          if (tierErr) {
            results.push({ id, success: false, error: tierErr.message });
            continue;
          }
          if (isRpcResponse(tierData) && tierData.success === false) {
            results.push({ id, success: false, error: tierData.error || 'Tier RPC failed' });
            continue;
          }
        }

        // Prepare direct profile updates for account_type/credits
        const toUpdate: Record<string, unknown> = {};
        if (typeof account_type === 'string') toUpdate.account_type = account_type;
        if (typeof credits === 'number' && Number.isFinite(credits)) toUpdate.credits = Math.trunc(credits);

        if (Object.keys(toUpdate).length > 0) {
          const { error: updErr } = await supabase
            .from('profiles')
            .update({ ...toUpdate, updated_at: new Date().toISOString() })
            .eq('id', id);

          if (updErr) {
            results.push({ id, success: false, error: updErr.message });
            continue;
          }
        }

        results.push({ id, success: true });
      } catch (e) {
        results.push({ id, success: false, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    const okCount = results.filter(r => r.success).length;
    // Write admin audit log (best-effort; non-blocking)
    try {
      if (okCount > 0 && ctx.user?.id) {
        await supabase.rpc('write_admin_audit', {
          p_actor_user_id: ctx.user.id,
          p_action: 'users.bulk_update',
          p_target: 'profiles',
          p_payload: { results },
        });
      }
    } catch (auditErr) {
      logger.warn('Audit log write failed for /admin/users PATCH', auditErr);
    }
    const status = okCount === results.length ? 200 : okCount > 0 ? 207 : 400;
    return NextResponse.json({ success: okCount > 0, results }, { status });
  } catch (err) {
    logger.error('Unhandled PATCH /admin/users error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAdminAuth(getHandler);
export const PATCH = withAdminAuth(patchHandler);
export async function OPTIONS() { return NextResponse.json({}, { status: 200 }); }
