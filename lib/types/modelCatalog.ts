import type { CatalogProviderSlug } from "../constants/modelProviders";

export type TierGroup = 'free' | 'pro' | 'enterprise';

export type FeatureFilter = "multimodal" | "reasoning" | "image" | "free" | "paid";

export interface ModelCatalogEntry {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image?: string | null;
    outputImage?: string | null;
    webSearch?: string | null;
    internalReasoning?: string | null;
    cacheRead?: string | null;
    cacheWrite?: string | null;
  };
  modalities: {
    input: string[];
    output: string[];
  };
  supportedParameters: string[];
  provider: {
    slug: CatalogProviderSlug;
    label: string;
  };
  tiers: {
    free: boolean;
    pro: boolean;
    enterprise: boolean;
  };
  tierGroup: TierGroup;
  maxCompletionTokens: number | null;
  isModerated: boolean;
  lastSyncedAt: string | null;
  updatedAt: string | null;
}

export interface ModelCatalogPayload {
  updatedAt: string;
  models: ModelCatalogEntry[];
}

export interface ModelCatalogFilters {
  search: string;
  tiers: TierGroup[];
  providers: CatalogProviderSlug[];
  features: FeatureFilter[];
}
