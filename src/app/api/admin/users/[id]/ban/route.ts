// src/app/api/admin/users/[id]/ban/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { withAdminAuth } from '../../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../../lib/types/auth';
import { createClient } from '../../../../../../../lib/supabase/server';
import { createServiceClient } from '../../../../../../../lib/supabase/service';
import { logger } from '../../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../../lib/utils/headers';
import { deleteAuthSnapshot } from '../../../../../../../lib/utils/authSnapshot';
import { getStripeClient } from '../../../../../../../lib/stripe/server';


type BanBody = { until?: string | null; reason?: string | null };

async function handler(req: NextRequest, ctx: AuthContext) {
  const t0 = Date.now();
  const requestId = deriveRequestIdFromHeaders(req.headers);
  const url = new URL(req.url);
  const id = url.pathname.split('/').slice(-2)[0]; // .../users/{id}/ban

  const route = '/api/admin/users/[id]/ban';

  try {
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing user id' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    // Prevent self-ban from UI mishaps
    if (ctx.user?.id === id) {
      return NextResponse.json({ success: false, error: 'Cannot ban your own account' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    const body = (await req.json().catch(() => ({}))) as BanBody;
    const reason = (body.reason || '').trim();
    const untilIso = body.until ? String(body.until) : null;

    // Minimal validation
    if (!reason || reason.length < 3) {
      return NextResponse.json({ success: false, error: 'Reason required' }, { status: 400, headers: { 'x-request-id': requestId } });
    }

    let until: string | null = null;
    if (untilIso) {
      const ts = Date.parse(untilIso);
      if (Number.isNaN(ts)) {
        return NextResponse.json({ success: false, error: 'Invalid until timestamp' }, { status: 400, headers: { 'x-request-id': requestId } });
      }
      until = new Date(ts).toISOString();
    }

    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: subscription, error: subscriptionError } = await serviceSupabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, cancel_at_period_end')
      .eq('user_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) {
      logger.error('admin.users.ban.subscription_lookup_fail', subscriptionError, { requestId, route: '/api/admin/users/[id]/ban', ctx: { id } });
      return NextResponse.json({ success: false, error: 'Failed to lookup subscription' }, { status: 500, headers: { 'x-request-id': requestId } });
    }

    if (subscription?.stripe_subscription_id && subscription.status !== 'canceled') {
      const stripe = getStripeClient({ requestId, route });
      if (!stripe) {
        return NextResponse.json(
          { success: false, error: 'Stripe not configured' },
          { status: 500, headers: { 'x-request-id': requestId } },
        );
      }

      if (!subscription.cancel_at_period_end) {
        try {
          const cancellationParams: Stripe.SubscriptionUpdateParams = {
            cancel_at_period_end: true,
          };

          (cancellationParams as Stripe.SubscriptionUpdateParams & {
            cancellation_details?: {
              comment?: string;
              feedback?: Stripe.Subscription.CancellationDetails.Feedback;
            };
          }).cancellation_details = {
            comment: 'Account banned',
            feedback: 'other',
          };

          await stripe.subscriptions.update(subscription.stripe_subscription_id, cancellationParams as Stripe.SubscriptionUpdateParams);
          const { error: updateError } = await serviceSupabase
            .from('subscriptions')
            .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
            .eq('id', subscription.id);
          if (updateError) {
            logger.warn('admin.users.ban.subscription_flag_update_fail', { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, subscriptionId: subscription.stripe_subscription_id, error: updateError.message } });
          }
          logger.infoOrDebug('admin.users.ban.stripe_cancelled', { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, subscriptionId: subscription.stripe_subscription_id } });
        } catch (stripeErr) {
          logger.error('admin.users.ban.stripe_cancel_fail', stripeErr, { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, subscriptionId: subscription.stripe_subscription_id } });
          return NextResponse.json({ success: false, error: 'Failed to cancel Stripe subscription' }, { status: 500, headers: { 'x-request-id': requestId } });
        }
      } else {
        logger.infoOrDebug('admin.users.ban.stripe_already_scheduled', { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, subscriptionId: subscription.stripe_subscription_id } });
      }
    }

    const { data, error } = await supabase.rpc('ban_user', {
      p_user_id: id,
      p_until: until,
      p_reason: reason,
    });

    if (error) {
      logger.error('admin.users.ban.rpc.fail', error, { requestId, route: '/api/admin/users/[id]/ban', ctx: { id } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: { 'x-request-id': requestId } });
    }

    // Invalidate auth snapshot cache for immediate enforcement
    await deleteAuthSnapshot(id).catch(() => {});

    logger.infoOrDebug('admin.users.ban.ok', { requestId, route: '/api/admin/users/[id]/ban', ctx: { id, durationMs: Date.now() - t0 } });
    return NextResponse.json({ success: true, result: data }, { headers: { 'x-request-id': requestId } });
  } catch (err) {
    logger.error('admin.users.ban.unhandled', err, { requestId, route: '/api/admin/users/[id]/ban' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}

export const POST = withAdminAuth(withTieredRateLimit(handler, { tier: 'tierD' }));
export async function OPTIONS() { return NextResponse.json({}, { status: 200 }); }
