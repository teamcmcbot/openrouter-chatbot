interface ItemListSchema {
  '@context': string;
  '@type': string;
  name: string;
  description: string;
  numberOfItems: number;
  itemListElement: Array<{
    '@type': string;
    position: number;
    item: {
      '@type': string;
      name: string;
      url: string;
      description: string;
      applicationCategory: string;
      provider: {
        '@type': string;
        name: string;
      };
    };
  }>;
}

interface FAQSchema {
  '@context': string;
  '@type': string;
  mainEntity: Array<{
    '@type': string;
    name: string;
    acceptedAnswer: {
      '@type': string;
      text: string;
    };
  }>;
}

export interface FAQItem {
  question: string;
  answer: string;
}

/**
 * Generate ItemList structured data for the model catalog.
 * Limits to top 30 models for performance.
 * Works with both ModelCatalogEntry and ModelCatalogClientEntry since they share common fields.
 */
export function generateModelCatalogItemList(
  models: Array<{ id: string; name: string; description: string; provider: { label: string } }>,
  siteUrl: string
): ItemListSchema {
  // Limit to top 30 models to keep JSON-LD size manageable
  const topModels = models.slice(0, 30);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI Model Catalog',
    description: 'Complete catalog of AI models available across Free, Pro, and Enterprise subscription tiers',
    numberOfItems: topModels.length,
    itemListElement: topModels.map((model, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SoftwareApplication',
        name: model.name,
        url: `${siteUrl}/models/${encodeURIComponent(model.id)}`,
        description: model.description || `${model.name} by ${model.provider.label}`,
        applicationCategory: 'AI Language Model',
        provider: {
          '@type': 'Organization',
          name: model.provider.label,
        },
      },
    })),
  };
}

/**
 * Generate FAQPage structured data for common model catalog questions.
 */
export function generateModelCatalogFAQ(faqItems: FAQItem[]): FAQSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Default FAQ items for the model catalog.
 * These should match the visible FAQ section on the page.
 */
export const DEFAULT_MODEL_CATALOG_FAQ: FAQItem[] = [
  {
    question: 'What AI models are available on the Free tier?',
    answer:
      'The Free tier includes models from providers like DeepSeek, Google and xAI. These models offer context windows up to 128k tokens and support various capabilities including multimodal input, reasoning, and image generation. Perfect for testing and light usage without any cost.',
  },
  {
    question: 'How do I compare model pricing?',
    answer:
      'Use the pricing columns in the catalog table to compare input (prompt) and output (completion) token costs. Most models show pricing per 1 million tokens. Some models are completely free, while others charge based on usage. Filter by the "FREE" or "PAID" badges to narrow your search.',
  },
  {
    question: "What's the difference between Free, Pro, and Enterprise tiers?",
    answer:
      'Free tier includes basic models with standard rate limits. Pro tier unlocks premium models like GPT-4, Claude 3 Opus, and Gemini Pro with higher context windows and faster response times. Enterprise tier adds dedicated support, custom rate limits, and access to the latest cutting-edge models.',
  },
  {
    question: 'Can I use multimodal models on the Free tier?',
    answer:
      'Yes! Many Free tier models support multimodal capabilities including image input, image generation, and audio processing. Look for the "MM" badge in the catalog table or filter by the "Multimodal" feature to find these models.',
  },
  {
    question: 'How do I choose the right model for my use case?',
    answer:
      'Consider three factors: (1) Context window - larger windows (100k+ tokens) handle longer documents; (2) Pricing - balance cost with quality for your budget; (3) Capabilities - check if you need reasoning, image generation, or multimodal support. Use the filters and search to narrow down options.',
  },
];
