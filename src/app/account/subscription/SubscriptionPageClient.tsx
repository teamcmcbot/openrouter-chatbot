"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../components/ui/Button";
import { useAuth } from "../../../../stores/useAuthStore";
import { useRouter, useSearchParams } from "next/navigation";
import { logger } from "../../../../lib/utils/logger";
import PlanSelector from "../../../../components/subscription/PlanSelector";
import BillingHistory from "../../../../components/subscription/BillingHistory";
import { TIER_LIMITS, TIER_FEATURES, TIER_LABELS } from "../../../../lib/constants/tiers";
import { TIER_PRICING_MONTHLY } from "../../../../lib/constants/tiers";
import ConfirmModal from "../../../../components/ui/ConfirmModal";
import { useModelStore } from "../../../../stores/useModelStore";
import toast from "react-hot-toast";

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
  canceledAt?: string | null;
  lastUpdated: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const months = [
      "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
    ];
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
  } catch {
    return "—";
  }
}

function formatRelativeToNow(iso: string | null) {
  if (!iso) return "";
  try {
    const target = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = target - now;
    const abs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (abs < minute) return diffMs >= 0 ? "in moments" : "moments ago";
    if (abs < hour) {
      const m = Math.round(abs / minute);
      return diffMs >= 0 ? `in ${m} min` : `${m} min ago`;
    }
    if (abs < day) {
      const h = Math.round(abs / hour);
      return diffMs >= 0 ? `in ${h} hr` : `${h} hr ago`;
    }
    const d = Math.round(abs / day);
    return diffMs >= 0 ? `in ${d} days` : `${d} days ago`;
  } catch {
    return "";
  }
}

// Format to dd-MMM-yyyy HH:mm in user's local timezone
function formatDateTimeLocal(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const months = [
      "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
    ];
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    // 12-hour format with AM/PM
    const hours24 = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 || 12;
    const hh = String(hours12).padStart(2, "0");
    return `${dd}-${mmm}-${yyyy}, ${hh}:${minutes} ${ampm}`;
  } catch {
    return "—";
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
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [showCancel, setShowCancel] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [undoLoading, setUndoLoading] = useState<boolean>(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState<boolean>(false);

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
    // Surface user-facing toasts based on redirect markers, then remove them from the URL
    if (!search) return;
    try {
      const success = search.get("success") === "true";
      const billingUpdated = search.get("billing_updated") === "1";
      const canceled = search.get("canceled") === "true";
      const action = search.get("action"); // e.g., cancel | undo_cancel

      // Priority: action-specific → success → billing updated → canceled
      if (action === "cancel") {
        toast.success("Cancellation scheduled for period end.");
      } else if (action === "undo_cancel") {
        toast.success("Subscription restored. Your plan remains active.");
      } else if (success) {
        toast.success("Subscription updated. Enjoy your new plan!");
      } else if (billingUpdated) {
        toast.success("Subscription updated.");
      } else if (canceled) {
        toast("Checkout canceled.");
      }

      if (success || billingUpdated || canceled || action) {
        // Strip the query markers to avoid duplicate toasts on re-mount/back nav
        const url = new URL(window.location.href);
        url.searchParams.delete("success");
        url.searchParams.delete("billing_updated");
        url.searchParams.delete("canceled");
        url.searchParams.delete("action");
        router.replace(url.pathname + (url.search ? url.search : ""));
      }
    } catch {
      // no-op
    }
  }, [router, search]);

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
      const res = await postJson<{ url: string }>("/api/stripe/start-subscription-flow", {
        plan,
        returnPathSuccess: "/account/subscription?success=true",
        returnPathCancel: "/account/subscription?canceled=true",
        // Optional: when updating via Portal, bring users back with a banner
        returnPath: "/account/subscription?billing_updated=1",
      });
      window.location.href = res.url;
    } catch (err: unknown) {
      logger.error("ui.subscription.checkout.failed", {
        msg: (err as Error)?.message,
      });
      toast.error("Failed to start checkout. Please try again.");
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
      toast.error("Failed to open billing portal. Please try again later.");
      setPortalLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (cancelLoading) return;
    setCancelLoading(true);
    try {
      const reason = cancelReason.trim().slice(0, 500);
      await postJson<{ ok: boolean }>("/api/stripe/cancel-subscription", reason ? { reason } : undefined);
      // Redirect with a marker so the page polls until webhook updates land
      window.location.href = "/account/subscription?billing_updated=1&action=cancel";
    } catch (err: unknown) {
      logger.error("ui.subscription.cancel.failed", {
        msg: (err as Error)?.message,
      });
      toast.error("Failed to schedule cancellation. Please try again.");
      setCancelLoading(false);
    }
  };

  const handleUndoCancel = async () => {
    setUndoLoading(true);
    try {
      await postJson<{ ok: boolean }>("/api/stripe/undo-cancel-subscription");
      window.location.href = "/account/subscription?billing_updated=1&action=undo_cancel";
    } catch (err: unknown) {
      logger.error("ui.subscription.undo_cancel.failed", {
        msg: (err as Error)?.message,
      });
      toast.error("Failed to undo cancellation. Please try again.");
      setUndoLoading(false);
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
  const label = (TIER_LABELS as Record<string, string>)[tier] ?? tier;
  const priceMonthly = (TIER_PRICING_MONTHLY as Record<string, number>)[tier as keyof typeof TIER_PRICING_MONTHLY] ?? 0;
  type LimitsKey = keyof typeof TIER_LIMITS;
  const limits = TIER_LIMITS[(tier as LimitsKey)] ?? TIER_LIMITS["free"]; 
  const renewDate = sub?.periodEnd ?? null;
  const renewRelative = formatRelativeToNow(renewDate);
  const isNewUser = !sub?.stripeCustomerId && !sub?.stripeSubscriptionId;
  const showRenew = !isNewUser && (status === "active" || status === "trialing") && !sub?.cancelAtPeriodEnd;
  const canceledOn = (() => {
    if (status === "canceled" && renewDate) return renewDate;
    if (status === "inactive" && renewDate) {
      const t = new Date(renewDate).getTime();
      if (!Number.isNaN(t) && t < Date.now()) return renewDate;
    }
    return null;
  })();

  // Action visibility
  const isPaidTier = tier === "pro" || tier === "enterprise";
  const periodEndTs = sub?.periodEnd ? Date.parse(sub.periodEnd) : null;
  const isFuturePeriodEnd = typeof periodEndTs === "number" && !Number.isNaN(periodEndTs) && periodEndTs > Date.now();
  const canCancel = isPaidTier && status === "active" && !sub?.cancelAtPeriodEnd;
  const canUndoCancel = isPaidTier && status === "active" && !!sub?.cancelAtPeriodEnd && isFuturePeriodEnd;

  const statusPill = (() => {
    const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1";
    const map: Record<Status, string> = {
      active: " bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
      trialing: " bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
      past_due: " bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
      unpaid: " bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
      canceled: " bg-gray-100 text-gray-700 ring-gray-300 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-500/30",
      inactive: " bg-gray-100 text-gray-700 ring-gray-300 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-500/30",
    } as Record<Status, string>;
    const cls = base + (map[status] || " bg-gray-100 text-gray-700 ring-gray-300 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-500/30");
    const text = status.replace(/_/g, " ");
    // Hide 'inactive' badge to avoid confusing users when on Free tier
    if (status === "inactive") return null;
    return <span className={cls}>{text}</span>;
  })();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">Subscription</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Manage your plan, billing, and renewal.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {/* Row 1: Title + Manage billing (right aligned) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-medium">Current Plan</h2>
            {sub?.stripeCustomerId && (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  onClick={handleManageBilling}
                  loading={portalLoading}
                  className="w-full sm:w-auto"
                >
                  Manage billing
                </Button>
              </div>
            )}
          </div>
          <div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-2xl font-semibold">{label}</div>
                {statusPill}
              </div>
              {/* Price */}
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span>${priceMonthly}/mo</span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <span>Renews on {showRenew && renewDate ? formatDateShort(renewDate) : "—"}</span>
                {showRenew && renewRelative && (
                  <span className="ml-1 text-gray-500 dark:text-gray-500">({renewRelative})</span>
                )}
              </div>
              {/* Removed quick chips for limits as requested */}
              {(status === "active" || status === "trialing") && sub?.cancelAtPeriodEnd && (
                <div className="text-sm text-amber-600 mt-1">
                  {sub?.periodEnd
                    ? `Scheduled to cancel at ${formatDateTimeLocal(sub.periodEnd)}`
                    : "Scheduled to cancel at period end"}
                </div>
              )}
              {canceledOn && (
                <div className="text-sm text-rose-600 mt-1">
                  Canceled on {formatDateShort(canceledOn)}
                </div>
              )}
              {polling && (
                <div className="text-sm text-emerald-600 mt-1">
                  Updating your subscription…
                </div>
              )}

              {/* Action row under renew/schedule notice (left-aligned) */}
              <div className="mt-2 flex gap-2">
                {canCancel && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setCancelReason("");
                      setShowCancel(true);
                    }}
                    loading={cancelLoading}
                    className="w-full sm:w-auto"
                  >
                    Cancel subscription
                  </Button>
                )}
                {canUndoCancel && (
                  <Button
                    variant="primary"
                    onClick={() => setShowUndoConfirm(true)}
                    loading={undoLoading}
                    className="w-full sm:w-auto"
                  >
                    Don’t cancel subscription
                  </Button>
                )}
              </div>

              {/* Labeled divider and two-column details */}
              <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700/60">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Limits & features</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Feature Access (left) */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">Feature Access</div>
                    {(() => {
                      type FeaturesKey = keyof typeof TIER_FEATURES;
                      const k = (tier as FeaturesKey);
                      const f = TIER_FEATURES[k] ?? TIER_FEATURES["free"];
                      const Row = ({ label, enabled }: { label: string; enabled: boolean }) => (
                        <div className="text-sm flex items-center gap-2">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-400 dark:bg-gray-500"}`} />
                          <span className={enabled ? "text-gray-900 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}>{label}</span>
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

                  {/* Tier-Based Limits (right) */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">Tier-Based Limits</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Requests/hour</span>
                        <span className="font-medium text-gray-900 dark:text-gray-200">{limits.maxRequestsPerHour?.toLocaleString?.() ?? limits.maxRequestsPerHour}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Tokens/request</span>
                        <span className="font-medium text-gray-900 dark:text-gray-200">{limits.maxTokensPerRequest?.toLocaleString?.() ?? limits.maxTokensPerRequest}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium mb-2">{tier === "free" ? "Select Plan" : "Switch Plan"}</h3>
          <PlanSelector
            currentTier={tier}
            onUpgrade={handleUpgrade}
            loading={loading}
            autoSelectFirst={search?.get("src") === "upgrade"}
          />
        </div>
      </div>

      <BillingHistory />

      {/* Cancel subscription confirm modal */}
      <ConfirmModal
        isOpen={showCancel}
        onCancel={() => {
          setShowCancel(false);
          setCancelReason("");
        }}
        onConfirm={handleCancelSubscription}
        title="Cancel subscription?"
        description="We will schedule your subscription to cancel at the end of the current billing period. You will keep access until then."
        confirmText="Yes, cancel at period end"
        cancelText="Keep subscription"
      >
        <div className="text-left">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="cancel-reason">
            Cancellation reason (optional)
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            maxLength={500}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Let us know why you're canceling"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 input-emerald-focus"
          />
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={showUndoConfirm}
        onCancel={() => setShowUndoConfirm(false)}
        onConfirm={() => {
          setShowUndoConfirm(false);
          handleUndoCancel();
        }}
        title="Resume your subscription?"
        description="This will remove the scheduled cancellation and keep your current plan renewing each cycle."
        confirmText="Yes, keep my subscription"
        cancelText="No, stay canceled"
      />
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
