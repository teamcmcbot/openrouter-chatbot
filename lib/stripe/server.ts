import Stripe from 'stripe';
import { logger } from '../utils/logger';

let cachedStripe: Stripe | null = null;

interface GetStripeClientOptions {
  requestId?: string | null;
  route?: string;
  purpose?: string;
}

export function getStripeClient(options: GetStripeClientOptions = {}): Stripe | null {
  const { requestId = null, route = 'stripe', purpose } = options;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    const error = new Error('STRIPE_SECRET_KEY is not configured');
    const meta = {
      requestId,
      route,
      ...(purpose ? { ctx: { purpose } } : {}),
    } as const;
    logger.error('stripe.missing_secret', error, meta);
    return null;
  }

  if (!cachedStripe) {
    const config: Stripe.StripeConfig = {};
    if (process.env.STRIPE_API_VERSION) {
      config.apiVersion = process.env.STRIPE_API_VERSION as Stripe.StripeConfig['apiVersion'];
    }

    cachedStripe = new Stripe(secretKey, config);
  }

  return cachedStripe;
}

export function resetStripeClientForTests() {
  if (process.env.NODE_ENV === 'test') {
    cachedStripe = null;
  }
}

type CancellationDetailsInput = {
  comment?: string;
  feedback?: Stripe.Subscription.CancellationDetails.Feedback;
} | null | undefined;

type SubscriptionUpdateWithCancellation = Stripe.SubscriptionUpdateParams & {
  cancellation_details?: {
    comment?: string;
    feedback?: Stripe.Subscription.CancellationDetails.Feedback;
  };
};

export function createCancelAtPeriodEndParams(details?: CancellationDetailsInput): SubscriptionUpdateWithCancellation {
  const params: SubscriptionUpdateWithCancellation = {
    cancel_at_period_end: true,
  };

  if (!details) {
    return params;
  }

  const { comment, feedback } = details;
  if (comment || feedback) {
    params.cancellation_details = {};
    if (comment) {
      params.cancellation_details.comment = comment;
    }
    if (feedback) {
      params.cancellation_details.feedback = feedback;
    }
  }

  return params;
}
