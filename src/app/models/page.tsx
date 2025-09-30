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
import type { ModelCatalogEntry } from "../../../lib/types/modelCatalog";

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const canonicalUrl = `${siteUrl}/models`;
const brandName = process.env.BRAND_NAME || "OpenRouter Chatbot";

export const metadata: Metadata = {
  title: "Model Catalog | OpenRouter Chatbot",
  description:
    "Browse every active model in GreenBubble by subscription tier. Compare pricing, context length, capabilities, and providers at a glance.",
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: "Model Catalog",
    description:
      "Browse every active model in GreenBubble by subscription tier. Compare pricing, context length, capabilities, and providers at a glance.",
    url: canonicalUrl,
    siteName: brandName,
  },
  twitter: {
    card: "summary_large_image",
    title: "Model Catalog",
    description:
      "Compare OpenRouter models across Base, Pro, and Enterprise plans with pricing, context limits, and capabilities.",
  },
};

interface ModelsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  const updatedAt = catalog.updatedAt ? new Date(catalog.updatedAt) : null;

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

        <Suspense fallback={<div className="h-48 rounded-xl border border-gray-200 dark:border-gray-800 animate-pulse" />}>
          <ModelCatalogPageClient
            models={catalog.models}
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
      </div>

      <StructuredDataScripts models={catalog.models} />
    </>
  );
}
