import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import { getStripeClient } from '../../../../../lib/stripe/server';

type Plan = 'pro' | 'enterprise';

const PLAN_TO_PRICE_ENV: Record<Plan, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
};

async function handler(req: NextRequest, auth: import('../../../../../lib/types/auth').AuthContext) {
  const requestId = crypto.randomUUID();
  const route = '/api/stripe/checkout-session';
  const stripe = getStripeClient({ requestId, route });

  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    if (req.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const plan: Plan = body.plan;
    const trialDays: number | undefined = body.trialDays;
    const returnPathSuccess = body.returnPathSuccess || process.env.STRIPE_SUCCESS_URL || '/account/subscription?success=true';
    const returnPathCancel = body.returnPathCancel || process.env.STRIPE_CANCEL_URL || '/account/subscription?canceled=true';

    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const priceId = PLAN_TO_PRICE_ENV[plan];
    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Ensure Stripe customer exists for this user
    const supabase = await createClient();
    const userId = auth.user!.id;
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      logger.error('stripe.checkout.profile_fetch_fail', profileErr || {});
      return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
    }

    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: { userId: profile.id },
      });
      customerId = customer.id;
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
      if (upErr) {
        logger.warn('stripe.checkout.customer_link_update_fail', { err: upErr.message });
      }
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId!,
      success_url: `${appUrl}${returnPathSuccess}`,
      cancel_url: `${appUrl}${returnPathCancel}`,
      line_items: [
        { price: priceId, quantity: 1 },
      ],
      allow_promotion_codes: true,
    };
    if (typeof trialDays === 'number' && trialDays > 0) {
      params.subscription_data = { trial_period_days: trialDays };
    }

    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: requestId,
    });

    logger.info('stripe.checkout.created', { requestId, route, ctx: { plan } });
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    logger.error('stripe.checkout.error', err, { route });
    return NextResponse.json({ error: 'Stripe checkout error' }, { status: 500 });
  }
}

export const POST = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
