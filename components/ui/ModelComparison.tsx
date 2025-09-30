"use client";

import ModelCatalogTable from "./ModelCatalogTable";
import type {
  FeatureFilter,
  ModelCatalogClientEntry,
  ModelCatalogFilters,
  TierGroup,
} from "../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../lib/constants/modelProviders";

export interface ModelComparisonProps {
  models: ModelCatalogClientEntry[];
  highlightedTier?: TierGroup | null;
  initialSearch?: string;
  initialFeatureFilters?: FeatureFilter[];
  initialProviderFilters?: CatalogProviderSlug[];
  onFiltersChange?: (filters: ModelCatalogFilters) => void;
}

export function ModelComparison(props: Readonly<ModelComparisonProps>) {
  return <ModelCatalogTable {...props} />;
}

export default ModelCatalogTable;
