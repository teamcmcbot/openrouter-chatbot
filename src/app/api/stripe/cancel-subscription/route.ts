import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import type { AuthContext } from '../../../../../lib/types/auth';
import { createCancelAtPeriodEndParams, getStripeClient } from '../../../../../lib/stripe/server';

async function handler(req: NextRequest, auth: AuthContext) {
  const route = '/api/stripe/cancel-subscription';
  const stripe = getStripeClient({ route });

  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    if (req.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const reason = rawReason ? rawReason.slice(0, 500) : '';

    const supabase = await createClient();
    const user = auth.user;

    if (!user) {
      logger.error('stripe.cancel.missing_user', undefined, { route });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_subscription_id || sub.status === 'canceled') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const updateParams = createCancelAtPeriodEndParams(reason ? { comment: reason, feedback: 'other' } : undefined);

    await stripe.subscriptions.update(sub.stripe_subscription_id, updateParams);

    // DB will be updated via webhook
    logger.info('stripe.cancel.requested', { route, ctx: { withReason: Boolean(reason) } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    logger.error('stripe.cancel.error', err, { route });
    return NextResponse.json({ error: 'Cancel error' }, { status: 500 });
  }
}

export const POST = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
