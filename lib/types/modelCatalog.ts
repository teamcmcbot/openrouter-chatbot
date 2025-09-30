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

export interface ModelCatalogClientEntry {
  id: string;
  name: string;
  description: string;
  provider: {
    slug: CatalogProviderSlug;
    label: string;
  };
  tierGroup: TierGroup;
  tiers: {
    free: boolean;
    pro: boolean;
    enterprise: boolean;
  };
  contextTokens: number;
  contextDisplay: string;
  pricing: {
    promptDisplay: string;
    promptUnit: string;
    completionDisplay: string;
    completionUnit: string;
    imageDisplay: string | null;
    imageUnit: string | null;
  };
  flags: {
    isFree: boolean;
    isPaid: boolean;
    multimodal: boolean;
    reasoning: boolean;
    image: boolean;
  };
  modalities: string[];
  modalitiesExtra: number;
  searchIndex: string;
  updatedAt: string | null;
}

export interface ModelCatalogClientPayload {
  updatedAt: string;
  models: ModelCatalogClientEntry[];
}

export interface ModelCatalogFilters {
  search: string;
  tiers: TierGroup[];
  providers: CatalogProviderSlug[];
  features: FeatureFilter[];
}
