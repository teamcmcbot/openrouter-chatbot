import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import type { AuthContext } from '../../../../../lib/types/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

async function handler(req: NextRequest, auth: AuthContext) {
  const route = '/api/stripe/cancel-subscription';
  try {
    if (req.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const reason = rawReason ? rawReason.slice(0, 500) : '';

    const supabase = await createClient();
    const userId = auth.user!.id;

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

    const updateParams: Stripe.SubscriptionUpdateParams = {
      cancel_at_period_end: true,
    };

    if (reason) {
      (updateParams as Stripe.SubscriptionUpdateParams & {
        cancellation_details?: {
          comment?: string;
          feedback?: Stripe.Subscription.CancellationDetails.Feedback;
        };
      }).cancellation_details = {
        comment: reason,
        feedback: 'other',
      };
    }

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
