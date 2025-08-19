"use client";

import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import Tooltip from "./Tooltip";
import React from "react";
import { TIER_LABELS, TIER_LIMITS, Tier } from "../../lib/constants/tiers";

interface TierBadgeProps {
  tier: Tier | string; // tolerate unknown strings, fallback to gray style
  className?: string;
  // Tooltip controls
  showTooltip?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "end";
  widthClassName?: string;
}

// Reusable subscription badge styled like UserSettings, with a click/hover tooltip that shows tier benefits
export default function TierBadge({
  tier,
  className = "",
  showTooltip = true,
  side = "bottom",
  align = "end",
  widthClassName = "w-64 sm:w-72",
}: Readonly<TierBadgeProps>) {
  const tierLower = (tier || "").toString().toLowerCase() as Tier;
  const label = TIER_LABELS[tierLower] ?? (tierLower.charAt(0).toUpperCase() + tierLower.slice(1));

  const subscriptionBadgeClass =
    tierLower === "enterprise"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
      : tierLower === "pro"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
      : "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-500/30";

  const pill = (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${subscriptionBadgeClass} ${className}`}
    >
      <ShieldCheckIcon className="h-4 w-4" />
      <span className="capitalize">{label}</span>
    </span>
  );

  if (!showTooltip) return pill;

  return (
    <Tooltip
      side={side}
      align={align}
      widthClassName={widthClassName}
      content={
        <div className="space-y-1">
          <div className="text-xs text-gray-600 dark:text-gray-400">Tier-Based Limits</div>
          {(() => {
            const limits = TIER_LIMITS[tierLower] ?? TIER_LIMITS["free"];
            return (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Requests/hour</span>
                  <span className="font-medium">{limits.hasRateLimitBypass ? "Bypass" : limits.maxRequestsPerHour.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tokens/request</span>
                  <span className="font-medium">{limits.maxTokensPerRequest.toLocaleString()}</span>
                </div>
                {limits.hasRateLimitBypass && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                    Enterprise accounts bypass hourly rate limits.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      }
    >
      {pill}
    </Tooltip>
  );
}
