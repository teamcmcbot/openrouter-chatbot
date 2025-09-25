"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import { useAuth } from "../../stores/useAuthStore";
import { useRouter, useSearchParams } from "next/navigation";
import { logger } from "../../lib/utils/logger";
import PlanSelector from "./PlanSelector";
import BillingHistory from "./BillingHistory";
import { useModelStore } from "../../stores/useModelStore";

// Types
export type Tier = "free" | "pro" | "enterprise";
export type Status =
  | "inactive"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "trialing";

interface SubscriptionResp {
  tier: Tier;
  status: Status;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastUpdated: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso ?? "—";
  }
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

function SubscriptionPageInner() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [sub, setSub] = useState<SubscriptionResp | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [portalLoading, setPortalLoading] = useState<boolean>(false);
  const [polling, setPolling] = useState<boolean>(false);
  const pollAbort = useRef<boolean>(false);

  const hasRedirectMarker = useMemo(() => {
    if (!search) return false;
    return (
      search.get("success") === "true" || search.get("billing_updated") === "1"
    );
  }, [search]);

  const fetchSubscription = async () => {
    try {
      const data = await getJson<SubscriptionResp>("/api/stripe/subscription");
      setSub(data);
      return data;
    } catch (err: unknown) {
      logger.warn("ui.subscription.fetch.failed", {
        msg: (err as Error)?.message,
      });
      throw err;
    }
  };

  useEffect(() => {
    // initial fetch: only when authenticated; otherwise send user to sign-in
    if (authLoading) return;
    if (user) {
      fetchSubscription().catch(() => {});
    } else {
      // Anonymous → go to canonical sign-in with safe return target
      const rt = encodeURIComponent("/account/subscription");
      router.replace(`/auth/signin?returnTo=${rt}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    // backoff polling after returning from Stripe until webhook updates land
    if (!hasRedirectMarker) return;
    let cancelled = false;
    pollAbort.current = false;
    setPolling(true);

    const delays = [500, 1000, 2000, 2000, 2000];

    const run = async () => {
      for (const delay of delays) {
        if (cancelled || pollAbort.current) break;
        const s = await fetchSubscription().catch(() => null);
        if (!s) {
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        // Stop when status becomes active or canceled states reflect
        if (s.status === "active" || s.status === "canceled" || s.cancelAtPeriodEnd) {
          break;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      if (!cancelled) setPolling(false);
    };
    run();
    return () => {
      cancelled = true;
      pollAbort.current = true;
      setPolling(false);
    };
  }, [hasRedirectMarker]);

  useEffect(() => {
    // After billing changes (checkout success or portal updates), refresh the models list
    if (!hasRedirectMarker) return;
    try {
      const refresh = useModelStore.getState().refreshModels;
      // Fire and forget; store handles caching and network logic
      refresh().catch(() => {
        // Intentionally swallow; UI can continue with existing cache
      });
      logger.info("ui.subscription.models.refresh.triggered", {
        ctx: { reason: "billing_redirect_marker" },
      });
    } catch {
      // No-op on any unexpected error
    }
    // Only depend on the marker so it runs once per redirect
  }, [hasRedirectMarker]);

  useEffect(() => {
    // refetch on focus/visibility (authenticated only)
    const onFocus = () => {
      if (!authLoading && user) fetchSubscription().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [authLoading, user]);

  const handleUpgrade = async (plan: Tier) => {
    setLoading(true);
    try {
      const res = await postJson<{ url: string }>(
        "/api/stripe/checkout-session",
        {
          plan,
          returnPathSuccess: "/account/subscription?success=true",
          returnPathCancel: "/account/subscription?canceled=true",
        }
      );
      window.location.href = res.url;
    } catch (err: unknown) {
      logger.error("ui.subscription.checkout.failed", {
        msg: (err as Error)?.message,
      });
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await postJson<{ url: string }>(
        "/api/stripe/customer-portal",
        {
          returnPath: "/account/subscription?billing_updated=1",
        }
      );
      window.location.href = res.url;
    } catch (err: unknown) {
      logger.error("ui.subscription.portal.failed", {
        msg: (err as Error)?.message,
      });
      setPortalLoading(false);
    }
  };

  if (!authLoading && !user) {
    // While router.replace runs, render nothing to avoid flash
    return null;
  }

  const tier = sub?.tier ?? "free";
  const status = sub?.status ?? "inactive";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">Subscription</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Manage your plan, billing, and renewal.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-2">Current Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold capitalize">{tier}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Status: {status}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Renews: {formatDate(sub?.periodEnd ?? null)}
              </div>
              {sub?.cancelAtPeriodEnd && (
                <div className="text-sm text-amber-600 mt-1">
                  Scheduled to cancel at period end
                </div>
              )}
              {polling && (
                <div className="text-sm text-emerald-600 mt-1">
                  Updating your subscription…
                </div>
              )}
            </div>
            {sub?.stripeCustomerId && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleManageBilling}
                  loading={portalLoading}
                >
                  Manage billing
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium mb-2">Upgrade</h3>
          <PlanSelector
            currentTier={tier}
            onUpgrade={handleUpgrade}
            loading={loading}
          />
        </div>
      </div>

      <BillingHistory />
    </div>
  );
}

export default function SubscriptionPageClient() {
  // Redundant Suspense for nested boundaries during hydration; safe no-op if already wrapped
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto p-6">Loading…</div>}>
      <SubscriptionPageInner />
    </Suspense>
  );
}
