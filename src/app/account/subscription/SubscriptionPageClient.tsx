"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../components/ui/Button";
import { useAuth } from "../../../../stores/useAuthStore";
import { useSearchParams } from "next/navigation";
import { logger } from "../../../../lib/utils/logger";
import PlanSelector from "../../../../components/subscription/PlanSelector";
import BillingHistory from "../../../../components/subscription/BillingHistory";
import { TIER_LIMITS, TIER_FEATURES } from "../../../../lib/constants/tiers";

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
    // initial fetch
    fetchSubscription().catch(() => {});
  }, []);

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
    // refetch on focus/visibility
    const onFocus = () => fetchSubscription().catch(() => {});
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

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
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Subscription</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Please sign in to manage your subscription.
        </p>
        <a
          href={
            `/auth/signin?returnTo=${encodeURIComponent('/account/subscription?src=upgrade')}`
          }
          className="inline-flex items-center px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Sign in to continue
        </a>
      </div>
    );
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-medium">Current Plan</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleManageBilling}
                loading={portalLoading}
              >
                Manage billing
              </Button>
            </div>
          </div>
          <div>
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

              {/* Divider before limits */}
              <div className="my-4 border-t border-gray-200 dark:border-gray-700" />

              {/* Inline plan details */}
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Tier-Based Limits</div>
                  {(() => {
                    type LimitsKey = keyof typeof TIER_LIMITS;
                    const key = (tier as LimitsKey);
                    const limits = TIER_LIMITS[key] ?? TIER_LIMITS["free"];
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300">Requests/hour</span>
                          <span className="font-medium">{limits.maxRequestsPerHour?.toLocaleString?.() ?? limits.maxRequestsPerHour}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300">Tokens/request</span>
                          <span className="font-medium">{limits.maxTokensPerRequest?.toLocaleString?.() ?? limits.maxTokensPerRequest}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Feature Access</div>
                  {(() => {
                    type FeaturesKey = keyof typeof TIER_FEATURES;
                    const k = (tier as FeaturesKey);
                    const f = TIER_FEATURES[k] ?? TIER_FEATURES["free"];
                    const Row = ({ label, enabled }: { label: string; enabled: boolean }) => (
                      <div className="text-sm flex items-center gap-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-400 dark:bg-gray-500"}`} />
                        <span className={enabled ? "text-gray-800 dark:text-gray-200" : "text-gray-500"}>{label}</span>
                      </div>
                    );
                    return (
                      <>
                        <Row label="Web Search" enabled={!!f.webSearch} />
                        <Row label="Reasoning" enabled={!!f.reasoning} />
                        <Row label="Image Attachments" enabled={!!f.imageAttachments} />
                        <Row label="Image Generation" enabled={!!f.imageGeneration} />
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium mb-2">Select Plan</h3>
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
