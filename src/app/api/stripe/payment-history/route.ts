import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import type { AuthContext } from '../../../../../lib/types/auth';

async function handler(req: NextRequest, auth: AuthContext) {
  const route = '/api/stripe/payment-history';
  try {
    const supabase = await createClient();
    const userId = auth.user!.id;

    const url = new URL(req.url);
    const sp = url.searchParams;
    const page = Math.max(1, Number(sp.get('page') || 1));
    const pageSizeRaw = Number(sp.get('pageSize') || 10);
    const pageSize = Math.min(Math.max(1, pageSizeRaw || 10), 50); // clamp 1..50
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('payment_history')
      .select(
        'id, stripe_invoice_id, stripe_payment_intent_id, amount, currency, status, description, created_at',
        { count: 'exact' }
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const res = {
      items: data ?? [],
      page,
      pageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };

    return NextResponse.json(res, { status: 200 });
  } catch (err: unknown) {
    logger.error('stripe.payment_history.get.error', err, { route });
    return NextResponse.json(
      { error: 'Failed to load payment history' },
      { status: 500 }
    );
  }
}

export const GET = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
