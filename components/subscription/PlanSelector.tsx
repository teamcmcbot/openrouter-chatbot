"use client";

import { useMemo, useState, useEffect } from "react";
import Button from "../ui/Button";
import { TIER_FEATURES, TIER_LABELS, TIER_LIMITS } from "../../lib/constants/tiers";
import ConfirmModal from "../ui/ConfirmModal";

type Tier = "free" | "pro" | "enterprise";

// Pricing (USD/month) - keep in sync with Stripe Price IDs in backend
const PRICING: Record<Exclude<Tier, "free">, number> = { pro: 5, enterprise: 15 };

interface PlanSelectorProps {
  currentTier: Tier;
  onUpgrade: (plan: Tier) => void;
  loading?: boolean;
  // When true, select the first available option on mount (used for src=upgrade deep link)
  autoSelectFirst?: boolean;
  requestedPlan?: Exclude<Tier, "free"> | null;
}

export default function PlanSelector({
  currentTier,
  onUpgrade,
  loading,
  autoSelectFirst = false,
  requestedPlan = null,
}: PlanSelectorProps) {
  // Allowed plan options based on current tier
  const options = useMemo(() => {
    const all: Array<{ id: Exclude<Tier, "free">; price: number }> = [
      { id: "pro", price: PRICING.pro },
      { id: "enterprise", price: PRICING.enterprise },
    ];
    if (currentTier === "free") return all;
    if (currentTier === "pro") return all.filter((p) => p.id === "enterprise");
    // enterprise -> allow choosing pro (downgrade)
    return all.filter((p) => p.id === "pro");
  }, [currentTier]);

  const requestedSelection = useMemo<Exclude<Tier, "free"> | null>(() => {
    if (!requestedPlan) return null;
    return options.some((o) => o.id === requestedPlan) ? requestedPlan : null;
  }, [options, requestedPlan]);

  const [selected, setSelected] = useState<Exclude<Tier, "free"> | null>(() => {
    if (requestedSelection) return requestedSelection;
    return autoSelectFirst ? (options[0]?.id ?? null) : null;
  });
  // Keep selection valid when options change
  useEffect(() => {
    if (!selected) {
      if (requestedSelection) {
        setSelected(requestedSelection);
        return;
      }
      if (autoSelectFirst) {
        setSelected(options[0]?.id ?? null);
      }
      return;
    }
    if (!options.find((o) => o.id === selected)) {
      if (requestedSelection) {
        setSelected(requestedSelection);
        return;
      }
      setSelected(autoSelectFirst ? (options[0]?.id ?? null) : null);
    }
  }, [options, selected, autoSelectFirst, requestedSelection]);

  const featuresList = (tier: Exclude<Tier, "free">) => {
    const f = TIER_FEATURES[tier];
    return [
      { label: "Web Search", enabled: f.webSearch },
      { label: "Reasoning", enabled: f.reasoning },
      { label: "Image Attachments", enabled: f.imageAttachments },
      { label: "Image Generation", enabled: f.imageGeneration },
    ];
  };

  const [showDowngrade, setShowDowngrade] = useState(false);

  const proceed = () => {
    if (!selected) return;
    onUpgrade(selected);
  };

  const handleContinue = () => {
    if (!selected) return;
    // Enterprise -> Pro requires confirmation
    if (currentTier === "enterprise" && selected === "pro") {
      setShowDowngrade(true);
      return;
    }
    proceed();
  };

  if (options.length === 0) {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400">
        You are on the highest plan available. To manage or cancel, use Manage billing.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        {options.map((opt) => {
          const isSelected = selected === opt.id;
          const tierLabel = TIER_LABELS[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelected(opt.id)}
              className={
                "text-left rounded-lg border p-3 transition " +
                (isSelected
                  ? "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-emerald-400")
              }
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{tierLabel}</div>
                <div className="text-sm">
                  <span className="font-semibold">${opt.price}</span>
                  <span className="text-gray-500 dark:text-gray-400">/mo</span>
                </div>
              </div>
              {/* Limits */}
              <div className="mt-2 space-y-1 text-sm">
                {(() => {
                  type LimitsKey = keyof typeof TIER_LIMITS;
                  const k = opt.id as LimitsKey;
                  const limits = TIER_LIMITS[k];
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Requests/hour</span>
                        <span className="font-medium">{limits.maxRequestsPerHour.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Tokens/request</span>
                        <span className="font-medium">{limits.maxTokensPerRequest.toLocaleString()}</span>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Features */}
              <ul className="mt-2 space-y-1">
                {featuresList(opt.id).map((feat) => (
                  <li key={feat.label} className="text-xs flex items-center gap-2">
                    <span
                      className={
                        "inline-block w-1.5 h-1.5 rounded-full " +
                        (feat.enabled ? "bg-emerald-500" : "bg-gray-400 dark:bg-gray-500")
                      }
                    />
                    <span className={feat.enabled ? "text-gray-800 dark:text-gray-200" : "text-gray-500"}>
                      {feat.label}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <Button
        onClick={handleContinue}
        loading={!!loading}
        disabled={!selected}
        className="w-full disabled:bg-gray-300 disabled:text-gray-600 disabled:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-300 dark:disabled:hover:bg-gray-700"
      >
        Continue checkout
      </Button>

      {/* Downgrade confirm modal */}
      <ConfirmModal
        isOpen={showDowngrade}
        onCancel={() => setShowDowngrade(false)}
        onConfirm={() => {
          setShowDowngrade(false);
          proceed();
        }}
        title="Switch to Pro?"
        description={
          "You are downgrading from Enterprise to Pro. This may reduce your limits and features. You can manage billing anytime in the portal."
        }
        confirmText="Yes, switch to Pro"
        cancelText="Keep Enterprise"
      />
    </div>
  );
}
