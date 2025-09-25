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
