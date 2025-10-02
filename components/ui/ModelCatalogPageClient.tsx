"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ModelCatalogTable from "./ModelCatalogTable";
import FilterSummary from "./FilterSummary";
import { matchesFeatureFilter } from "../../lib/utils/modelCatalogClient";
import type {
  FeatureFilter,
  ModelCatalogClientEntry,
  ModelCatalogClientPayload,
  ModelCatalogFilters,
  TierGroup,
} from "../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../lib/constants/modelProviders";

interface ModelCatalogPageClientProps {
  highlightedTier?: TierGroup | null;
  initialSearch?: string;
  initialFeatureFilters?: FeatureFilter[];
  initialProviderFilters?: CatalogProviderSlug[];
}

export default function ModelCatalogPageClient({
  highlightedTier,
  initialSearch,
  initialFeatureFilters,
  initialProviderFilters,
}: Readonly<ModelCatalogPageClientProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // PHASE 2.5: Fetch catalog client-side to avoid huge HTML payload
  const [models, setModels] = useState<ModelCatalogClientEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track current filters for real-time count calculation
  const [currentFilters, setCurrentFilters] = useState<ModelCatalogFilters>({
    search: initialSearch || "",
    tiers: [],
    providers: initialProviderFilters || [],
    features: initialFeatureFilters || [],
  });

  useEffect(() => {
    let isMounted = true;
    
    async function fetchCatalog() {
      try {
        const response = await fetch('/api/models/catalog');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: ModelCatalogClientPayload = await response.json();
        
        if (isMounted) {
          setModels(data.models);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load models');
          setIsLoading(false);
        }
      }
    }
    
    fetchCatalog();
    return () => { isMounted = false; };
  }, []);
  
  // Calculate filtered count dynamically based on current filters
  const filteredCount = useMemo(() => {
    const searchTerm = currentFilters.search.trim().toLowerCase();
    return models.filter((model) => {
      // Feature filters
      if (currentFilters.features.length > 0) {
        const matchesAll = currentFilters.features.every((feature) => 
          matchesFeatureFilter(model, feature)
        );
        if (!matchesAll) return false;
      }

      // Provider filters
      if (currentFilters.providers.length > 0 && 
          !currentFilters.providers.includes(model.provider.slug)) {
        return false;
      }

      // Search query
      if (searchTerm && !model.searchIndex.includes(searchTerm)) {
        return false;
      }

      return true;
    }).length;
  }, [models, currentFilters]);

  const handleFiltersChange = useCallback(
    (filters: ModelCatalogFilters) => {
      // Update local state for real-time count
      setCurrentFilters(filters);
      
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

  // Show loading state while fetching
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent dark:border-emerald-400" />
        <p className="text-sm text-gray-600 dark:text-gray-300">Loading model catalog...</p>
      </div>
    );
  }

  // Show error state if fetch failed
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-red-600 dark:text-red-400">
          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">Failed to load model catalog</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterSummary
        features={currentFilters.features}
        providers={currentFilters.providers}
        searchQuery={currentFilters.search}
        modelCount={filteredCount}
      />
      
      <ModelCatalogTable
        models={models}
        highlightedTier={highlightedTier}
        initialSearch={initialSearch}
        initialFeatureFilters={initialFeatureFilters}
        initialProviderFilters={initialProviderFilters}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  );
}
