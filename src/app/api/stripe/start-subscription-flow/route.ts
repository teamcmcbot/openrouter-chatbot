import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import { getSafeReturnTo } from '../../../../../lib/utils/returnTo';
import type { AuthContext } from '../../../../../lib/types/auth';

type Plan = 'pro' | 'enterprise';

const PLAN_TO_PRICE_ENV: Record<Plan, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
};

// Stripe client (optionally override API version to enable newer portal flow_data fields)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  // When STRIPE_API_VERSION is provided (e.g., a 2024+ version), advanced portal deep-links with
  // flow_data.subscription_update.items/proration_behavior are more likely to be supported.
  apiVersion: (process.env.STRIPE_API_VERSION as unknown as Stripe.StripeConfig['apiVersion']) || undefined,
});

function idSuffix(id?: string | null) {
  if (!id || typeof id !== 'string') return null;
  return id.slice(-6);
}

async function handler(req: NextRequest, auth: AuthContext) {
  const requestId = crypto.randomUUID();
  const route = '/api/stripe/start-subscription-flow';

  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const plan: Plan = body.plan;
  const returnPath: string | undefined = body.returnPath; // used for Portal
    const returnPathSuccess: string = body.returnPathSuccess || process.env.STRIPE_SUCCESS_URL || '/account/subscription?success=true';
    const returnPathCancel: string = body.returnPathCancel || process.env.STRIPE_CANCEL_URL || '/account/subscription?canceled=true';

    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const priceId = PLAN_TO_PRICE_ENV[plan];
    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
    }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const defaultPortalPath = '/account/subscription?billing_updated=1';
  const safeReturnPath = getSafeReturnTo(returnPath) || defaultPortalPath;
  const targetReturnUrl = `${appUrl}${safeReturnPath}`;

    // Ensure Stripe customer exists for this user
    const supabase = await createClient();
    const userId = auth.user!.id;
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      logger.error('stripe.start_flow.profile_fetch_fail', profileErr || {});
      return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
    }

    let customerId = (profile.stripe_customer_id as string) || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || undefined,
        metadata: { userId: profile.id },
      });
      customerId = customer.id;
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
      if (upErr) {
        logger.warn('stripe.start_flow.customer_link_update_fail', { err: upErr.message });
      }
    }

    // Lookup the most recent subscription for this user
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status, cancel_at_period_end')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasExisting = !!(sub?.stripe_subscription_id && sub.status && sub.status !== 'canceled');

    if (!hasExisting) {
      // New subscription → Stripe Checkout
      logger.info('stripe.start_flow.checkout.prepare', {
        requestId,
        route,
        ctx: {
          plan,
          priceId,
          apiVersion: process.env.STRIPE_API_VERSION || null,
          successUrl: `${appUrl}${returnPathSuccess}`,
          cancelUrl: `${appUrl}${returnPathCancel}`,
        },
      });
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId!,
        success_url: `${appUrl}${returnPathSuccess}`,
        cancel_url: `${appUrl}${returnPathCancel}`,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
      }, {
        idempotencyKey: requestId,
      });

      logger.info('stripe.start_flow.checkout', { requestId, route, ctx: { plan } });
      return NextResponse.json({ url: session.url }, { status: 200 });
    }

    // Existing subscription → Prefer Billing Portal confirm flow (preselect price) using subscription item id
    const basePortalParams = {
      customer: customerId!,
      return_url: targetReturnUrl,
    } as const;

    try {
      // Retrieve subscription to get the subscription item id (confirm flow only supports single item)
  const stripeSub: Stripe.Response<Stripe.Subscription> = await stripe.subscriptions.retrieve(sub!.stripe_subscription_id!);
  const items: Stripe.SubscriptionItem[] = stripeSub.items?.data ?? [];
      if (!Array.isArray(items) || items.length !== 1) {
        throw Object.assign(new Error('unsupported_multiple_items'), { code: 'unsupported_multiple_items' });
      }
      const subItemId: string | undefined = items[0]?.id;
      if (!subItemId) {
        throw Object.assign(new Error('no_subscription_item'), { code: 'no_subscription_item' });
      }

      // Confirm flow: preselect target price using subscription item id
      const confirmFlow: Stripe.BillingPortal.SessionCreateParams.FlowData = {
        type: 'subscription_update_confirm',
        after_completion: {
            type: 'redirect',
            redirect: {
                return_url: targetReturnUrl,
            },
        },
        subscription_update_confirm: {
          subscription: sub!.stripe_subscription_id!,
          items: [{ id: subItemId, price: priceId, quantity: 1 }],
        },
      } as const;

      logger.info('stripe.start_flow.portal.prepare', {
        requestId,
        route,
        ctx: {
          plan,
          mode: 'confirm',
          apiVersion: process.env.STRIPE_API_VERSION || null,
          customerIdSuffix: idSuffix(customerId),
          subscriptionIdSuffix: idSuffix(sub!.stripe_subscription_id!),
          subscriptionItemIdSuffix: idSuffix(subItemId),
          priceId,
          returnUrl: basePortalParams.return_url,
          afterCompletion: 'redirect',
        },
      });

      const portal = await stripe.billingPortal.sessions.create({
        ...basePortalParams,
        flow_data: confirmFlow,
      });
      logger.info('stripe.start_flow.portal', { requestId, route, ctx: { plan, mode: 'confirm' } });
      return NextResponse.json({ url: portal.url }, { status: 200 });
    } catch (e: unknown) {
      // Fallback 1: minimal subscription_update (no items) so user can choose in portal
      const err = e as { code?: string; message?: string; param?: string } | null | undefined;
      logger.warn('stripe.start_flow.portal_confirm_fallback_minimal', {
        requestId,
        route,
        ctx: { plan, code: err?.code, param: err?.param },
      });
      const minimalFlow: Stripe.BillingPortal.SessionCreateParams.FlowData = {
        type: 'subscription_update',
        subscription_update: { subscription: sub!.stripe_subscription_id! },
      };
      try {
        logger.info('stripe.start_flow.portal.prepare', {
          requestId,
          route,
          ctx: {
            plan,
            mode: 'minimal',
            apiVersion: process.env.STRIPE_API_VERSION || null,
            customerIdSuffix: idSuffix(customerId),
            subscriptionIdSuffix: idSuffix(sub!.stripe_subscription_id!),
            priceId,
            returnUrl: basePortalParams.return_url,
          },
        });
        const portal = await stripe.billingPortal.sessions.create({
          ...basePortalParams,
          flow_data: minimalFlow,
        });
        logger.info('stripe.start_flow.portal', { requestId, route, ctx: { plan, mode: 'minimal' } });
        return NextResponse.json({ url: portal.url }, { status: 200 });
      } catch {
        // Final fallback: plain portal
        logger.warn('stripe.start_flow.portal_fallback_plain', { requestId, route, ctx: { plan } });
        logger.info('stripe.start_flow.portal.prepare', {
          requestId,
          route,
          ctx: {
            plan,
            mode: 'plain',
            apiVersion: process.env.STRIPE_API_VERSION || null,
            customerIdSuffix: idSuffix(customerId),
            subscriptionIdSuffix: idSuffix(sub!.stripe_subscription_id!),
            priceId,
            returnUrl: basePortalParams.return_url,
          },
        });
        const portal = await stripe.billingPortal.sessions.create({
          ...basePortalParams,
        });
        logger.info('stripe.start_flow.portal', { requestId, route, ctx: { plan, mode: 'plain' } });
        return NextResponse.json({ url: portal.url }, { status: 200 });
      }
    }
  } catch (err: unknown) {
    logger.error('stripe.start_flow.error', err, { route });
    return NextResponse.json({ error: 'Stripe routing error' }, { status: 500 });
  }
}

export const POST = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
