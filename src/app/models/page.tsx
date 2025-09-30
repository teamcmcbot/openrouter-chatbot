import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getModelCatalog } from "../../../lib/server/modelCatalog";
import ModelCatalogPageClient from "../../../components/ui/ModelCatalogPageClient";
import {
  parseFeatureFilters,
  parseProviderFilters,
  parseTier,
} from "../../../lib/utils/modelCatalogFilters";
import {
  generateModelCatalogItemList,
  generateModelCatalogFAQ,
  DEFAULT_MODEL_CATALOG_FAQ,
  type FAQItem,
} from "../../../lib/utils/structuredData/modelCatalog";
import { generateFilterMetadata } from "../../../lib/utils/seo/filterMetadata";
import type { ModelCatalogEntry } from "../../../lib/types/modelCatalog";
import {
  buildClientCatalog,
  countClientModels,
  matchesFeatureFilter,
} from "../../../lib/utils/modelCatalogClient";
import type { ModelCatalogClientEntry } from "../../../lib/types/modelCatalog";
import FilterSummary from "../../../components/ui/FilterSummary";
import PopularFilters from "../../../components/ui/PopularFilters";

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const brandName = process.env.BRAND_NAME || "OpenRouter Chatbot";

interface ModelsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function countFilteredClientModels(
  models: ModelCatalogClientEntry[],
  features: ReturnType<typeof parseFeatureFilters>,
  providers: ReturnType<typeof parseProviderFilters>,
  searchQuery: string
): number {
  const searchTerm = searchQuery.trim().toLowerCase();
  return models.filter((model) => {
    if (features.length > 0) {
      const matchesAll = features.every((feature) => matchesFeatureFilter(model, feature));
      if (!matchesAll) return false;
    }

    if (providers.length > 0 && !providers.includes(model.provider.slug)) {
      return false;
    }

    if (searchTerm && !model.searchIndex.includes(searchTerm)) {
      return false;
    }

    return true;
  }).length;
}

export async function generateMetadata({ searchParams }: ModelsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const features = parseFeatureFilters(params.features);
  const providers = parseProviderFilters(params.providers);
  const searchQuery = typeof params.q === "string" ? params.q : "";

  // Get model catalog to calculate filtered count for metadata
  const catalog = await getModelCatalog();
  const clientModels = buildClientCatalog(catalog.models);
  const filteredCount = countFilteredClientModels(clientModels, features, providers, searchQuery);

  const { title, description } = generateFilterMetadata(features, providers, searchQuery, filteredCount);
  
  // Smart canonical URL logic for SEO
  // Popular single-filter combinations get their own canonical URL
  // Complex filters canonicalize to base /models to avoid duplicate content
  let canonicalUrl = `${siteUrl}/models`;
  
  const isPopularFilter = 
    (features.length === 1 && providers.length === 0 && !searchQuery) || // Single feature filter
    (features.length === 0 && providers.length === 1 && !searchQuery) || // Single provider filter
    (features.length === 1 && features.includes('free') && providers.length === 1 && providers.includes('google') && !searchQuery); // Specific combo
  
  if (isPopularFilter) {
    const queryParams = new URLSearchParams();
    if (features.length > 0) queryParams.set('features', features.join(','));
    if (providers.length > 0) queryParams.set('providers', providers.join(','));
    const queryString = queryParams.toString();
    if (queryString) {
      canonicalUrl = `${siteUrl}/models?${queryString}`;
    }
  }

  return {
  title,
  description,
  alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: brandName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function FAQSection({ items }: { items: FAQItem[] }) {
  return (
    <section className="mt-16 max-w-4xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-50 mb-6 text-center">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4">
        {items.map((faq, index) => (
          <details
            key={index}
            className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
          >
            <summary className="font-semibold text-base text-gray-900 dark:text-gray-50 cursor-pointer list-none flex items-center justify-between">
              <span>{faq.question}</span>
              <svg
                className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function StructuredDataScripts({ models }: { models: ModelCatalogEntry[] }) {
  const itemListData = generateModelCatalogItemList(models, siteUrl);
  const faqData = generateModelCatalogFAQ(DEFAULT_MODEL_CATALOG_FAQ);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
      />
    </>
  );
}

export default async function ModelsPage({ searchParams }: ModelsPageProps) {
  const params = (await searchParams) ?? {};
  const highlightedTier = parseTier(params.tier);
  const initialFeatureFilters = parseFeatureFilters(params.features);
  const initialProviderFilters = parseProviderFilters(params.providers);
  const initialSearch = typeof params.q === "string" ? params.q : "";

  const catalog = await getModelCatalog();
  const clientModels = buildClientCatalog(catalog.models);
  const updatedAt = catalog.updatedAt ? new Date(catalog.updatedAt) : null;

  const filteredCount = countFilteredClientModels(
    clientModels,
    initialFeatureFilters,
    initialProviderFilters,
    initialSearch
  );

  // Generate popular filter links with counts
  const popularLinks = [
    {
      label: "Free Models",
      href: "/models?features=free",
  count: countClientModels(clientModels, 'free'),
      description: "AI models with zero cost. Perfect for testing and light usage.",
    },
    {
      label: "Multimodal Models",
      href: "/models?features=multimodal",
  count: countClientModels(clientModels, 'multimodal'),
      description: "Models supporting image input, image generation, and audio processing.",
    },
    {
      label: "Reasoning Models",
      href: "/models?features=reasoning",
  count: countClientModels(clientModels, 'reasoning'),
      description: "Advanced AI models with structured reasoning capabilities.",
    },
    {
      label: "Image Generation",
      href: "/models?features=image",
  count: countClientModels(clientModels, 'image'),
      description: "AI models capable of generating images from text prompts.",
    },
    {
      label: "OpenAI Models",
      href: "/models?providers=openai",
  count: countClientModels(clientModels, undefined, 'openai'),
      description: "All OpenAI models including GPT-4, GPT-4 Turbo, and GPT-3.5.",
    },
    {
      label: "Google Models",
      href: "/models?providers=google",
  count: countClientModels(clientModels, undefined, 'google'),
      description: "Gemini and other Google AI models with multimodal capabilities.",
    },
    {
      label: "Anthropic Models",
      href: "/models?providers=anthropic",
  count: countClientModels(clientModels, undefined, 'anthropic'),
      description: "Claude models from Anthropic with extended context windows.",
    },
    {
      label: "Free Google Models",
      href: "/models?features=free&providers=google",
  count: countClientModels(clientModels, 'free', 'google'),
      description: "Free-tier Google AI models including Gemini Flash.",
    },
    {
      label: "Paid Premium Models",
      href: "/models?features=paid",
  count: countClientModels(clientModels, 'paid'),
      description: "Premium AI models with competitive pricing and advanced capabilities.",
    },
  ];

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            Model Catalog
          </h1>
          <p className="mx-auto max-w-3xl text-base md:text-lg text-gray-600 dark:text-gray-300">
            Explore which OpenRouter models are available on the Free, Pro, and Enterprise plans. Filter by provider, compare pricing, and decide where to upgrade.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Want to see how this compares to pricing?&nbsp;
            <Link href="/#pricing" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium">
              Jump to plans
            </Link>
            .
          </p>
        </div>

        <FilterSummary
          features={initialFeatureFilters}
          providers={initialProviderFilters}
          searchQuery={initialSearch}
          modelCount={filteredCount}
        />

        <Suspense fallback={<div className="h-48 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />}>
          <ModelCatalogPageClient
            models={clientModels}
            highlightedTier={highlightedTier}
            initialSearch={initialSearch}
            initialFeatureFilters={initialFeatureFilters}
            initialProviderFilters={initialProviderFilters}
          />
        </Suspense>

        {updatedAt && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Last synced {updatedAt.toLocaleString()}
          </p>
        )}

        <FAQSection items={DEFAULT_MODEL_CATALOG_FAQ} />

        <PopularFilters links={popularLinks} />
      </div>

      <StructuredDataScripts models={catalog.models} />
    </>
  );
}
