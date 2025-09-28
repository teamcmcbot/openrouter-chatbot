import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getModelCatalog } from "../../../lib/server/modelCatalog";
import ModelCatalogPageClient from "../../../components/ui/ModelCatalogPageClient";
import type { TierGroup } from "../../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../../lib/constants/modelProviders";

export const metadata: Metadata = {
  title: "Model Catalog | OpenRouter Chatbot",
  description:
    "Browse every active model in GreenBubble by subscription tier. Compare pricing, context length, capabilities, and providers at a glance.",
};

const validTiers: readonly TierGroup[] = ["free", "pro", "enterprise"] as const;

function parseTier(value: string | string[] | undefined): TierGroup | null {
  if (!value) return null;
  const target = Array.isArray(value) ? value[0] : value;
  if (validTiers.includes(target as TierGroup)) {
    return target as TierGroup;
  }
  return null;
}

function parseTierFilters(value: string | string[] | undefined): TierGroup[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  return parts
    .map((part) => part.trim())
    .filter((part): part is TierGroup => validTiers.includes(part as TierGroup));
}

function parseProviderFilters(value: string | string[] | undefined): CatalogProviderSlug[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(",");
  const normalized = parts.map((part) => part.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set([
    "openai",
    "google",
    "anthropic",
    "xai",
    "zai",
    "moonshot",
    "mistral",
    "other",
  ] satisfies CatalogProviderSlug[]);
  return normalized.filter((slug): slug is CatalogProviderSlug => allowed.has(slug as CatalogProviderSlug));
}

interface ModelsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ModelsPage({ searchParams }: ModelsPageProps) {
  const params = (await searchParams) ?? {};
  const highlightedTier = parseTier(params.tier);
  const initialTierFilters = parseTierFilters(params.tiers);
  const initialProviderFilters = parseProviderFilters(params.providers);
  const initialSearch = typeof params.q === "string" ? params.q : "";

  const catalog = await getModelCatalog();
  const updatedAt = catalog.updatedAt ? new Date(catalog.updatedAt) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3 text-center">
        <p className="text-sm font-semibold tracking-wide text-emerald-600 uppercase">Model Catalog</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
          Active models across every tier
        </h1>
        <p className="mx-auto max-w-3xl text-base md:text-lg text-gray-600 dark:text-gray-300">
          Explore which OpenRouter models are available on the Base, Pro, and Enterprise plans. Filter by provider, compare pricing, and decide where to upgrade.
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
          initialTierFilters={initialTierFilters}
          initialProviderFilters={initialProviderFilters}
        />
      </Suspense>

      {updatedAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Last synced {updatedAt.toLocaleString()}
        </p>
      )}
    </div>
  );
}
