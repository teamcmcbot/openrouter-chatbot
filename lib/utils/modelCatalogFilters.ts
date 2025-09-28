import type { FeatureFilter, TierGroup } from "../types/modelCatalog";
import type { CatalogProviderSlug } from "../constants/modelProviders";

export const VALID_TIERS: readonly TierGroup[] = ["free", "pro", "enterprise"] as const;

export const VALID_FEATURE_FILTERS: readonly FeatureFilter[] = [
  "multimodal",
  "reasoning",
  "image",
  "free",
  "paid",
] as const;

export function parseTier(value: string | string[] | undefined): TierGroup | null {
  if (!value) return null;
  const target = Array.isArray(value) ? value[0] : value;
  if (VALID_TIERS.includes(target as TierGroup)) {
    return target as TierGroup;
  }
  return null;
}

export function parseTierFilters(value: string | string[] | undefined): TierGroup[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  return parts
    .map((part) => part.trim())
    .filter((part): part is TierGroup => VALID_TIERS.includes(part as TierGroup));
}

const ALLOWED_PROVIDERS: readonly CatalogProviderSlug[] = [
  "openai",
  "google",
  "anthropic",
  "xai",
  "zai",
  "moonshot",
  "mistral",
  "other",
] as const;

export function parseProviderFilters(value: string | string[] | undefined): CatalogProviderSlug[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  const normalized = parts
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const allowedSet = new Set(ALLOWED_PROVIDERS);
  return normalized.filter((slug): slug is CatalogProviderSlug => allowedSet.has(slug as CatalogProviderSlug));
}

export function parseFeatureFilters(value: string | string[] | undefined): FeatureFilter[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  const normalized = parts
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const allowedSet = new Set(VALID_FEATURE_FILTERS);
  return normalized.filter((feature): feature is FeatureFilter => allowedSet.has(feature as FeatureFilter));
}
