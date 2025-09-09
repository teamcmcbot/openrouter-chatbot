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
  imageGeneration: boolean; // Enterprise only
}

export const TIER_LABELS: Record<Tier, string> = {
  anonymous: "Anonymous",
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

// Keep aligned with createFeatureFlags in lib/utils/auth.ts
// Note: These show the most restrictive limits (TierA - chat endpoints)
// which users are most likely to encounter first
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  anonymous: { maxRequestsPerHour: 10, maxTokensPerRequest: 5000, hasRateLimitBypass: false },
  free: { maxRequestsPerHour: 20, maxTokensPerRequest: 10000, hasRateLimitBypass: false },
  pro: { maxRequestsPerHour: 200, maxTokensPerRequest: 20000, hasRateLimitBypass: false },
  enterprise: { maxRequestsPerHour: 500, maxTokensPerRequest: 50000, hasRateLimitBypass: true },
};

// Keep aligned with the feature gating matrix in docs/subscription-tier-access.md
export const TIER_FEATURES: Record<Tier, TierFeatures> = {
  anonymous: { webSearch: false, reasoning: false, imageAttachments: false, imageGeneration: false },
  free: { webSearch: false, reasoning: false, imageAttachments: false, imageGeneration: false },
  pro: { webSearch: true, reasoning: false, imageAttachments: true, imageGeneration: false },
  enterprise: { webSearch: true, reasoning: true, imageAttachments: true, imageGeneration: true },
};
