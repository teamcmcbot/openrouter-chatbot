import type { FeatureFilter } from '../../types/modelCatalog';
import type { CatalogProviderSlug } from '../../constants/modelProviders';
import { CATALOG_PROVIDER_LABELS } from '../../constants/modelProviders';

interface FilterMetadata {
  title: string;
  description: string;
}

const FEATURE_LABELS: Record<FeatureFilter, string> = {
  multimodal: 'Multimodal',
  reasoning: 'Reasoning',
  image: 'Image Generation',
  free: 'Free',
  paid: 'Paid',
};

/**
 * Generate SEO-optimized title and description for filtered model catalog pages.
 * Creates unique metadata for each filter combination to improve search rankings.
 */
export function generateFilterMetadata(
  features: FeatureFilter[],
  providers: CatalogProviderSlug[],
  searchQuery: string,
  modelCount?: number
): FilterMetadata {
  const baseTitlePrefix = 'Model Catalog';
  
  // Search query takes priority
  if (searchQuery.trim()) {
    const query = searchQuery.trim();
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    return {
      title: `"${query}" Search Results${count} | ${baseTitlePrefix}`,
      description: `Search results for "${query}" in the AI model catalog. Compare pricing, context windows, and capabilities across all subscription tiers.`,
    };
  }

  // Single feature filter
  if (features.length === 1 && providers.length === 0) {
    const feature = features[0];
    const label = FEATURE_LABELS[feature];
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    switch (feature) {
      case 'free':
        return {
          title: `Free AI Models${count} | ${baseTitlePrefix}`,
          description: `Browse free AI models from providers like DeepSeek, Google, Anthropic, and xAI. These models offer context windows up to 128k tokens with no cost. Perfect for testing and light usage.`,
        };
      case 'paid':
        return {
          title: `Paid AI Models${count} | ${baseTitlePrefix}`,
          description: `Premium AI models with competitive pricing. Compare input and output token costs across GPT-4, Claude 3, Gemini Pro, and more. Find the best value for your use case.`,
        };
      case 'multimodal':
        return {
          title: `Multimodal AI Models${count} | ${baseTitlePrefix}`,
          description: `AI models supporting image input, image generation, and audio processing. Compare multimodal capabilities across Free, Pro, and Enterprise tiers.`,
        };
      case 'reasoning':
        return {
          title: `AI Models with Reasoning${count} | ${baseTitlePrefix}`,
          description: `Advanced AI models with structured reasoning capabilities. Compare context windows, pricing, and tier availability for reasoning-enabled models.`,
        };
      case 'image':
        return {
          title: `Image Generation Models${count} | ${baseTitlePrefix}`,
          description: `AI models capable of generating images. Compare pricing, quality, and tier availability for image generation across all providers.`,
        };
      default:
        return {
          title: `${label} Models${count} | ${baseTitlePrefix}`,
          description: `Browse ${label.toLowerCase()} AI models. Compare pricing, context windows, and capabilities across subscription tiers.`,
        };
    }
  }

  // Single provider filter
  if (providers.length === 1 && features.length === 0) {
    const provider = providers[0];
    const label = CATALOG_PROVIDER_LABELS[provider];
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    return {
      title: `${label} Models${count} | ${baseTitlePrefix}`,
      description: `Compare all ${label} models available on OpenRouter. View pricing, context windows, tier availability, and capabilities for ${label} AI models.`,
    };
  }

  // Feature + Provider combination
  if (features.length === 1 && providers.length === 1) {
    const feature = FEATURE_LABELS[features[0]];
    const provider = CATALOG_PROVIDER_LABELS[providers[0]];
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    return {
      title: `${feature} ${provider} Models${count} | ${baseTitlePrefix}`,
      description: `${feature} AI models from ${provider}. Compare pricing, context windows, and tier availability for ${provider}'s ${feature.toLowerCase()} offerings.`,
    };
  }

  // Multiple features
  if (features.length > 1 && providers.length === 0) {
    const featureList = features.map((f) => FEATURE_LABELS[f]).join(' + ');
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    return {
      title: `${featureList} AI Models${count} | ${baseTitlePrefix}`,
      description: `AI models with ${features.map((f) => FEATURE_LABELS[f].toLowerCase()).join(', ')} capabilities. Compare pricing and tier availability.`,
    };
  }

  // Multiple providers
  if (providers.length > 1 && features.length === 0) {
    const providerList = providers.map((p) => CATALOG_PROVIDER_LABELS[p]).join(', ');
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    return {
      title: `${providerList} Models${count} | ${baseTitlePrefix}`,
      description: `Compare AI models from ${providerList}. View pricing, context windows, and capabilities across multiple providers.`,
    };
  }

  // Complex combination (multiple features + providers)
  if (features.length > 0 || providers.length > 0) {
    const parts: string[] = [];
    if (features.length > 0) {
      parts.push(features.map((f) => FEATURE_LABELS[f]).join(', '));
    }
    if (providers.length > 0) {
      parts.push(`from ${providers.map((p) => CATALOG_PROVIDER_LABELS[p]).join(', ')}`);
    }
    const count = modelCount !== undefined ? ` (${modelCount})` : '';
    
    return {
      title: `${parts.join(' ')} Models${count} | ${baseTitlePrefix}`,
      description: `Filtered AI models: ${parts.join(' ')}. Compare pricing, context windows, and tier availability.`,
    };
  }

  // Default (no filters)
  return {
    title: `${baseTitlePrefix} | OpenRouter Chatbot`,
    description: 'Browse every active model in GreenBubble by subscription tier. Compare pricing, context length, capabilities, and providers at a glance.',
  };
}

/**
 * Generate a human-readable summary of active filters for display.
 */
export function generateFilterSummary(
  features: FeatureFilter[],
  providers: CatalogProviderSlug[],
  searchQuery: string,
  modelCount: number
): {
  hasFilters: boolean;
  summary: string;
  filterDetails: { type: string; values: string[] }[];
} {
  const filterDetails: { type: string; values: string[] }[] = [];

  if (searchQuery.trim()) {
    filterDetails.push({
      type: 'Search',
      values: [`"${searchQuery.trim()}"`],
    });
  }

  if (features.length > 0) {
    filterDetails.push({
      type: 'Features',
      values: features.map((f) => FEATURE_LABELS[f]),
    });
  }

  if (providers.length > 0) {
    filterDetails.push({
      type: 'Providers',
      values: providers.map((p) => CATALOG_PROVIDER_LABELS[p]),
    });
  }

  const hasFilters = filterDetails.length > 0;
  const modelText = modelCount === 1 ? 'model' : 'models';
  
  let summary: string;
  if (!hasFilters) {
    summary = `Showing all ${modelCount} ${modelText}`;
  } else {
    summary = `Showing ${modelCount} ${modelText} matching your filters`;
  }

  return {
    hasFilters,
    summary,
    filterDetails,
  };
}
