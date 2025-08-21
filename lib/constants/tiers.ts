export type Tier = "anonymous" | "free" | "pro" | "enterprise";

export interface TierLimits {
  maxRequestsPerHour: number;
  maxTokensPerRequest: number;
  hasRateLimitBypass: boolean;
}

export interface TierFeatures {
  // Entitlement-level gates (capability re-validation still occurs server-side)
  webSearch: boolean; // Pro+
  reasoning: boolean; // Enterprise only
  imageAttachments: boolean; // Pro+
}

export const TIER_LABELS: Record<Tier, string> = {
  anonymous: "Anonymous",
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

// Keep aligned with createFeatureFlags in lib/utils/auth.ts
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  anonymous: { maxRequestsPerHour: 20, maxTokensPerRequest: 5000, hasRateLimitBypass: false },
  free: { maxRequestsPerHour: 100, maxTokensPerRequest: 10000, hasRateLimitBypass: false },
  pro: { maxRequestsPerHour: 500, maxTokensPerRequest: 20000, hasRateLimitBypass: false },
  enterprise: { maxRequestsPerHour: 2000, maxTokensPerRequest: 50000, hasRateLimitBypass: true },
};

// Keep aligned with the feature gating matrix in docs/subscription-tier-access.md
export const TIER_FEATURES: Record<Tier, TierFeatures> = {
  anonymous: { webSearch: false, reasoning: false, imageAttachments: false },
  free: { webSearch: false, reasoning: false, imageAttachments: false },
  pro: { webSearch: true, reasoning: false, imageAttachments: true },
  enterprise: { webSearch: true, reasoning: true, imageAttachments: true },
};
