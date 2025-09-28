"use client";

import ModelCatalogTable from "./ModelCatalogTable";
import type {
  ModelCatalogEntry,
  ModelCatalogFilters,
  TierGroup,
} from "../../lib/types/modelCatalog";
import type { CatalogProviderSlug } from "../../lib/constants/modelProviders";

export interface ModelComparisonProps {
  models: ModelCatalogEntry[];
  highlightedTier?: TierGroup | null;
  initialSearch?: string;
  initialTierFilters?: TierGroup[];
  initialProviderFilters?: CatalogProviderSlug[];
  onFiltersChange?: (filters: ModelCatalogFilters) => void;
}

export function ModelComparison(props: Readonly<ModelComparisonProps>) {
  return <ModelCatalogTable {...props} />;
}

export default ModelCatalogTable;
