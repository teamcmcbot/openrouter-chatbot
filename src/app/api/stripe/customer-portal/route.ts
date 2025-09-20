import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { createClient } from '../../../../../lib/supabase/server';
import type { AuthContext } from '../../../../../lib/types/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

async function handler(req: NextRequest, auth: AuthContext) {
  const route = '/api/stripe/customer-portal';
  try {
    if (req.method !== 'POST') {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const body = await req.json().catch(() => ({}));
    const returnPath: string = body.returnPath || '/account/subscription';

    const supabase = await createClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id')
      .eq('id', auth.user!.id)
      .single();

    if (error || !profile || !profile.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}${returnPath}`,
    });

    logger.info('stripe.portal.created', { route });
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    // Provide clearer feedback for common Stripe setup issue (no default portal configuration)
    type StripeLikeError = {
      message?: string;
      statusCode?: number;
      rawType?: string;
    };
    const e = (err ?? {}) as StripeLikeError;
    const msg: string | undefined = e.message;
    const statusCode: number | undefined = e.statusCode;
    const rawType: string | undefined = e.rawType;

    if (
      statusCode === 400 && rawType === 'invalid_request_error' &&
      typeof msg === 'string' && msg.toLowerCase().includes('customer portal')
    ) {
      logger.warn('stripe.portal.missing_configuration', { route });
      return NextResponse.json(
        {
          error: 'Stripe Billing Portal is not configured in test mode. Please configure the default portal settings in your Stripe dashboard (Test mode): https://dashboard.stripe.com/test/settings/billing/portal',
        },
        { status: 400 }
      );
    }

    logger.error('stripe.portal.error', err, { route });
    return NextResponse.json({ error: 'Portal error' }, { status: 500 });
  }
}

export const POST = withProtectedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
