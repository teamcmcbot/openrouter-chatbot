"use client";

import { ShieldCheckIcon, GlobeAltIcon, LightBulbIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import Tooltip from "./Tooltip";
import React, { useEffect, useState } from "react";
import { TIER_LABELS, TIER_LIMITS, TIER_FEATURES, Tier } from "../../lib/constants/tiers";
import { useAuth } from "../../stores/useAuthStore";
import { createClient } from "../../lib/supabase/client";
import { useHydration } from "../../hooks/useHydration";

interface TierBadgeProps {
  tier: Tier | string; // tolerate unknown strings, fallback to gray style
  className?: string;
  // Tooltip controls
  showTooltip?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "end";
  widthClassName?: string;
  // Account type for enterprise admin detection
  accountType?: "user" | "admin";
}

// Reusable subscription badge styled like UserSettings, with a click/hover tooltip that shows tier benefits
export default function TierBadge({
  tier,
  className = "",
  showTooltip = true,
  side = "bottom",
  align = "end",
  widthClassName = "w-64 sm:w-72",
  accountType = "user",
}: Readonly<TierBadgeProps>) {
  const isHydrated = useHydration();
  const { user } = useAuth();
  const [actualAccountType, setActualAccountType] = useState<"user" | "admin">(accountType);

  // Fetch account type directly from database for enterprise users
  useEffect(() => {
    // Only run on client side after hydration
    if (!isHydrated || tier !== "enterprise" || !user?.id) {
      setActualAccountType(accountType);
      return;
    }

    let isMounted = true;
    async function fetchAccountType() {
      try {
        if (!user?.id) return;
        
        const supabase = createClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('account_type')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.warn('TierBadge: Failed to fetch account_type:', error.message);
          if (isMounted) setActualAccountType("user");
          return;
        }
        
        if (isMounted) {
          setActualAccountType((data?.account_type as "user" | "admin") || "user");
        }
      } catch (e) {
        console.warn('TierBadge: Error checking account type:', e);
        if (isMounted) setActualAccountType("user");
      }
    }
    
    fetchAccountType();
    
    return () => {
      isMounted = false;
    };
  }, [isHydrated, tier, user?.id, accountType]);

  const tierLower = (tier || "").toString().toLowerCase() as Tier;
  const label = TIER_LABELS[tierLower] ?? (tierLower.charAt(0).toUpperCase() + tierLower.slice(1));

  const subscriptionBadgeClass =
    tierLower === "enterprise"
      ? "bg-emerald-50 text-emerald-600 ring-2 ring-inset ring-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
      : tierLower === "pro"
      ? "bg-emerald-50 text-emerald-600 ring-2 ring-inset ring-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
      : "bg-slate-50 text-slate-700 ring-2 ring-inset ring-slate-500 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-500/30";

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
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Tier-Based Limits</div>
            {(() => {
              const limits = TIER_LIMITS[tierLower] ?? TIER_LIMITS["free"];
              // For enterprise users, check if they're admin to determine bypass
              const isEnterpriseAdmin = tierLower === "enterprise" && actualAccountType === "admin";
              const hasRateLimitBypass = isEnterpriseAdmin ? true : (tierLower === "enterprise" ? false : limits.hasRateLimitBypass);
              const maxRequestsPerHour = tierLower === "enterprise" ? 500 : limits.maxRequestsPerHour;
              
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Requests/hour</span>
                    <span className="font-medium">{hasRateLimitBypass ? "Bypass" : maxRequestsPerHour.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Tokens/request</span>
                    <span className="font-medium">{limits.maxTokensPerRequest.toLocaleString()}</span>
                  </div>
                  {hasRateLimitBypass && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                      Enterprise admins bypass hourly rate limits.
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Feature Access</div>
            {(() => {
              const f = TIER_FEATURES[tierLower] ?? TIER_FEATURES["free"];
              const Row = ({ label, enabled, icon: Icon }: { label: string; enabled: boolean; icon: React.ComponentType<{ className?: string }> }) => (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">{label}</span>
                  </span>
                  <span className={enabled ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-gray-500 dark:text-gray-500"}>
                    {enabled ? "Yes" : "No"}
                  </span>
                </div>
              );
              return (
                <>
                  <Row label="Web Search" enabled={f.webSearch} icon={GlobeAltIcon} />
                  <Row label="Reasoning" enabled={f.reasoning} icon={LightBulbIcon} />
                  <Row label="Image attachments" enabled={f.imageAttachments} icon={PaperClipIcon} />
                </>
              );
            })()}
          </div>
        </div>
      }
    >
      {pill}
    </Tooltip>
  );
}
