import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import type { AuthContext } from '../../../../../lib/types/auth';

async function handler(_req: NextRequest, auth: AuthContext) {
  const route = '/api/stripe/subscription';
  try {
    const supabase = await createClient();
    const userId = auth.user!.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, subscription_tier, subscription_status, stripe_customer_id')
      .eq('id', userId)
      .single();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const status = profile?.subscription_status || 'inactive';
    const periodEnd = sub?.current_period_end || null;
    const canceledAt = sub?.canceled_at || null;
    const rawCape = sub?.cancel_at_period_end || false;
    const ended = periodEnd ? Date.parse(periodEnd) < Date.now() : false;
    // Do not suppress scheduled-cancel just because canceledAt exists (Stripe may populate it on scheduling).
    // Only turn it off when the sub actually ended or is in a canceled/inactive state.
    const normalizedCape = (status === 'canceled' || status === 'inactive' || ended) ? false : rawCape;

    return NextResponse.json(
      {
        tier: profile?.subscription_tier || 'free',
        status,
        periodStart: sub?.current_period_start || null,
        periodEnd,
        cancelAtPeriodEnd: normalizedCape,
        canceledAt,
        lastUpdated: new Date().toISOString(),
        stripeCustomerId: profile?.stripe_customer_id || null,
        stripeSubscriptionId: sub?.stripe_subscription_id || null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('stripe.subscription.get.error', err, { route });
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}

export const GET = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
