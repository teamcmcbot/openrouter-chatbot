"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ModelCatalogTable from "./ModelCatalogTable";
import type {
  FeatureFilter,
  ModelCatalogEntry,
  ModelCatalogFilters,
  TierGroup,
} from "../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../lib/constants/modelProviders";

interface ModelCatalogPageClientProps {
  models: ModelCatalogEntry[];
  highlightedTier?: TierGroup | null;
  initialSearch?: string;
  initialFeatureFilters?: FeatureFilter[];
  initialProviderFilters?: CatalogProviderSlug[];
}

export default function ModelCatalogPageClient({
  models,
  highlightedTier,
  initialSearch,
  initialFeatureFilters,
  initialProviderFilters,
}: Readonly<ModelCatalogPageClientProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleFiltersChange = useCallback(
    (filters: ModelCatalogFilters) => {
      const current = searchParams.toString();
      const nextParams = new URLSearchParams(current);

      const trimmedSearch = filters.search.trim();
      if (trimmedSearch.length > 0) {
        nextParams.set("q", trimmedSearch);
      } else {
        nextParams.delete("q");
      }

      // Remove legacy tier filters from URL now that feature filters are primary
      nextParams.delete("tiers");

      if (filters.providers.length > 0) {
        nextParams.set("providers", filters.providers.join(","));
      } else {
        nextParams.delete("providers");
      }

      if (filters.features.length > 0) {
        nextParams.set("features", filters.features.join(","));
      } else {
        nextParams.delete("features");
      }

      const next = nextParams.toString();
      if (next !== current) {
        const query = next.length > 0 ? `?${next}` : "";
        router.replace(`${pathname}${query}`, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  return (
    <ModelCatalogTable
      models={models}
      highlightedTier={highlightedTier}
      initialSearch={initialSearch}
      initialFeatureFilters={initialFeatureFilters}
      initialProviderFilters={initialProviderFilters}
      onFiltersChange={handleFiltersChange}
    />
  );
}
