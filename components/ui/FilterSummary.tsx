import type { FeatureFilter } from "../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../lib/constants/modelProviders";
import { generateFilterSummary } from "../../lib/utils/seo/filterMetadata";

interface FilterSummaryProps {
  features: FeatureFilter[];
  providers: CatalogProviderSlug[];
  searchQuery: string;
  modelCount: number;
}

/**
 * Server-rendered filter summary for SEO.
 * Provides crawlable HTML describing active filters with semantic markup.
 */
export default function FilterSummary({
  features,
  providers,
  searchQuery,
  modelCount,
}: Readonly<FilterSummaryProps>) {
  const { hasFilters, summary, filterDetails } = generateFilterSummary(
    features,
    providers,
    searchQuery,
    modelCount
  );

  // Don't render if no filters are active
  if (!hasFilters) {
    return null;
  }

  return (
    <div
      className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 mb-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterDetails.map((detail) => (
            <div
              key={detail.type}
              className="inline-flex items-center gap-2 text-xs"
            >
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {detail.type}:
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {detail.values.join(", ")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
