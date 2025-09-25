import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { logger } from '../../../../../lib/utils/logger';
import { createServiceClient } from '../../../../../lib/supabase/service';
import { getStripeClient } from '../../../../../lib/stripe/server';

// We must read the raw body for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string | undefined;

async function readRawBody(req: NextRequest): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function priceToTier(priceId: string | null | undefined): 'pro' | 'enterprise' | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  return null;
}

function readNumberField(obj: unknown, ...keys: string[]): number | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return null;
}

function readBooleanField(obj: unknown, ...keys: string[]): boolean | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

function readStringField(obj: unknown, ...keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function readValue<T = unknown>(obj: unknown, ...keys: string[]): T | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      return record[key] as T;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const route = '/api/stripe/webhook';
  const supabase = createServiceClient();

  try {
    if (!webhookSecret) {
      logger.error('stripe.webhook.missing_secret', undefined, { route });
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const stripe = getStripeClient({ route, purpose: 'webhook' });
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const rawBody = await readRawBody(req);
    const sig = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('stripe.webhook.signature_invalid', { message }, { route });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Idempotency: record event.id if not seen
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Helper to upsert event id at the end
    const recordEvent = async () => {
      await supabase.from('stripe_events').insert({ id: event.id });
    };

    const ts = (secs: number | null | undefined) => (typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null);

    switch (event.type) {
      case 'checkout.session.completed': {
        // Minimal processing; rely on subsequent subscription.* events for state sync
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        if (customerId) {
          // Ensure we at least record the customer on profiles if missing
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          if (!profile) {
            // If profile is unknown by customer id, we do nothing here; subscription events will handle linking
          }
        }
        await recordEvent();
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;
        const subscriptionId = sub.id;
        const priceId = sub.items?.data?.[0]?.price?.id || null;
        const status = sub.status as 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';

        if (!customerId) {
          logger.warn('stripe.webhook.subscription_missing_customer', { route, ctx: { subscriptionId } });
          await recordEvent();
          break;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (profile?.id) {
          // Extract times, supporting both snake_case and camelCase based on SDK typing.
          // Some API versions omit top-level current_period_* and only include them on the first subscription item.
          const item0 = Array.isArray(sub.items?.data) && sub.items.data.length > 0 ? sub.items.data[0] : null;

          const cps = readNumberField(sub, 'current_period_start', 'currentPeriodStart')
            ?? readNumberField(item0, 'current_period_start', 'currentPeriodStart');
          const cpe = readNumberField(sub, 'current_period_end', 'currentPeriodEnd')
            ?? readNumberField(item0, 'current_period_end', 'currentPeriodEnd');
          let cape = readBooleanField(sub, 'cancel_at_period_end', 'cancelAtPeriodEnd') ?? false;
          // If Stripe has fully canceled the subscription, don't keep the flag set
          if (status === 'canceled') {
            cape = false;
          }
          const canceledAt = readNumberField(sub, 'canceled_at', 'canceledAt');

          await supabase.from('subscriptions').upsert({
            user_id: profile.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            status,
            current_period_start: ts(cps),
            current_period_end: ts(cpe),
            cancel_at_period_end: Boolean(cape),
            canceled_at: ts(canceledAt),
          }, { onConflict: 'stripe_subscription_id' });

          let newTier: 'free' | 'pro' | 'enterprise' = 'free';
          const mappedTier = priceToTier(priceId);
          if (status === 'active' || status === 'trialing') {
            newTier = mappedTier || 'pro';
          }

          await supabase.from('profiles').update({
            subscription_status: status === 'canceled' ? 'inactive' : status,
            subscription_tier: newTier,
            subscription_updated_at: new Date().toISOString(),
          }).eq('id', profile.id);
        }

        await recordEvent();
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id || null;
        const amountCents = readNumberField(inv, 'amount_paid', 'amountPaid', 'amount_due', 'amountDue') ?? 0;
        const amount = amountCents / 100;
        const currency = inv.currency || 'usd';
        const status = inv.status || null;
        const paymentIntentRaw = readValue<string | { id?: string }>(inv, 'payment_intent', 'paymentIntent');
        const paymentIntent = typeof paymentIntentRaw === 'string'
          ? paymentIntentRaw
          : readStringField(paymentIntentRaw, 'id');
        const invoiceId = inv.id;

        if (!customerId) {
          logger.warn('stripe.webhook.invoice_missing_customer', { route, ctx: { invoiceId } });
          await recordEvent();
          break;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (profile?.id) {
          await supabase.from('payment_history').insert({
            user_id: profile.id,
            stripe_payment_intent_id: paymentIntent,
            stripe_invoice_id: invoiceId,
            amount,
            currency,
            status,
            description: inv.description || null,
          });
        }
        await recordEvent();
        break;
      }

      default: {
        // Record unknown events to avoid repeated deliveries
        await recordEvent();
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    logger.error('stripe.webhook.error', err, { route });
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }
}
