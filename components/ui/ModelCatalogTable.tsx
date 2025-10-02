"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDebounce } from "../../hooks/useDebounce";
import TierBadge from "./TierBadge";
import Button from "./Button";
import ModelCard from "./ModelCard";
import {
  CATALOG_PROVIDER_DISPLAY_ORDER,
  CATALOG_PROVIDER_LABELS,
  type CatalogProviderSlug,
} from "../../lib/constants/modelProviders";
import type {
  FeatureFilter,
  ModelCatalogClientEntry,
  ModelCatalogFilters,
  TierGroup,
} from "../../lib/types/modelCatalog";
import { matchesFeatureFilter } from "../../lib/utils/modelCatalogClient";

const tierOrder: TierGroup[] = ["free", "pro", "enterprise"];

const tierLabels: Record<TierGroup, string> = {
  free: "Base (Free)",
  pro: "Pro",
  enterprise: "Enterprise",
};

const tierDescriptions: Record<TierGroup, string> = {
  free: "Included with every account",
  pro: "Unlock additional premium models",
  enterprise: "Exclusive enterprise access",
};

const FEATURE_FILTER_OPTIONS: ReadonlyArray<{ key: FeatureFilter; label: string }> = [
  { key: "multimodal", label: "Multi-modal" },
  { key: "reasoning", label: "Reasoning" },
  { key: "image", label: "Image generation" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

interface ModelCatalogTableProps {
  models: ModelCatalogClientEntry[];
  highlightedTier?: TierGroup | null;
  initialSearch?: string;
  initialFeatureFilters?: FeatureFilter[];
  initialProviderFilters?: CatalogProviderSlug[];
  onFiltersChange?: (filters: ModelCatalogFilters) => void;
}

type FeatureFilterState = Record<FeatureFilter, boolean>;

type ProviderFilterState = Record<CatalogProviderSlug, boolean>;

const VIRTUALIZATION_THRESHOLD = 30;
const ROW_ESTIMATE_PX = 88;
const MAX_SECTION_HEIGHT_PX = 560;
const MIN_SECTION_HEIGHT_PX = 240;

const DEFAULT_FEATURE_FILTER_STATE: FeatureFilterState = FEATURE_FILTER_OPTIONS.reduce<FeatureFilterState>(
  (acc, option) => {
    acc[option.key] = false;
    return acc;
  },
  {} as FeatureFilterState
);

const DEFAULT_EXPANDED_SECTIONS: Record<TierGroup, boolean> = {
  free: true,
  pro: true,
  enterprise: true,
};

function createSingleExpandedState(target: TierGroup): Record<TierGroup, boolean> {
  return tierOrder.reduce<Record<TierGroup, boolean>>((acc, tier) => {
    acc[tier] = tier === target;
    return acc;
  }, {} as Record<TierGroup, boolean>);
}

function toProviderArray(state: ProviderFilterState): CatalogProviderSlug[] {
  return CATALOG_PROVIDER_DISPLAY_ORDER.filter((slug) => state[slug]);
}

function toFeatureArray(state: FeatureFilterState): FeatureFilter[] {
  return FEATURE_FILTER_OPTIONS.filter(({ key }) => state[key]).map(({ key }) => key);
}

function areFeatureStatesEqual(a: FeatureFilterState, b: FeatureFilterState): boolean {
  return FEATURE_FILTER_OPTIONS.every(({ key }) => a[key] === b[key]);
}

function areProviderStatesEqual(a: ProviderFilterState, b: ProviderFilterState): boolean {
  return CATALOG_PROVIDER_DISPLAY_ORDER.every((slug) => a[slug] === b[slug]);
}

function renderModalities(model: ModelCatalogClientEntry) {
  if (!model.modalities || model.modalities.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const primary = model.modalities.slice(0, 2);
  return (
    <div className="flex flex-col items-start space-y-1">
      <div className="flex flex-wrap gap-1">
        {primary.map((modality) => (
          <span
            key={modality}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          >
            {modality}
          </span>
        ))}
      </div>
      {model.modalitiesExtra > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">+{model.modalitiesExtra} more</span>
      )}
    </div>
  );
}

function clampVirtualHeight(count: number): number {
  const estimated = count * ROW_ESTIMATE_PX;
  return Math.min(MAX_SECTION_HEIGHT_PX, Math.max(MIN_SECTION_HEIGHT_PX, estimated));
}

const badgeClasses =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide";

interface ModelRowProps {
  model: ModelCatalogClientEntry;
  style?: React.CSSProperties;
  measureElement?: (element: HTMLElement | null) => void;
}

function ModelRow({ model, style, measureElement }: ModelRowProps) {
  const ref = useCallback(
    (node: HTMLTableRowElement | null) => {
      measureElement?.(node);
    },
    [measureElement]
  );

  const { flags, pricing, tiers } = model;
  const isFreeTier = tiers.free;
  const isProTier = tiers.pro;
  const isEnterpriseTier = tiers.enterprise;

  return (
    <tr
      ref={ref}
      style={style}
      className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors"
    >
      <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-4 align-top">
        <div className="flex flex-col gap-1 max-w-sm">
          <Link
            href={`/models/${encodeURIComponent(model.id)}`}
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline"
          >
            {model.name}
          </Link>
          <code className="text-xs text-gray-500 dark:text-gray-400 truncate">{model.id}</code>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{model.description}</p>
          <div className="flex gap-1 mt-1">
            {flags.isFree && (
              <span className={`${badgeClasses} bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300`}>
                FREE
              </span>
            )}
            {flags.isPaid && (
              <span className={`${badgeClasses} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`}>
                PAID
              </span>
            )}
            {flags.multimodal && (
              <span className={`${badgeClasses} bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-700`}>
                MM
              </span>
            )}
            {flags.image && (
              <span className={`${badgeClasses} bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 border border-pink-200 dark:border-pink-700`}>
                IMAGE GENERATION
              </span>
            )}
            {flags.reasoning && (
              <span className={`${badgeClasses} bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300`}>
                R1
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-left align-top">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-50">{model.contextDisplay}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">tokens</div>
      </td>
      <td className="px-4 py-4 text-left align-top">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-50">{pricing.promptDisplay}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{pricing.promptUnit}</div>
      </td>
      <td className="px-4 py-4 text-left align-top">
        <div className="flex flex-col gap-2">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-50">
              {pricing.completionDisplay}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{pricing.completionUnit}</div>
          </div>
          {pricing.imageDisplay ? (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-50">
                {pricing.imageDisplay}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{pricing.imageUnit}</div>
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-4 text-left align-top">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
          {model.provider.label}
        </span>
      </td>
      <td className="px-4 py-4 text-left align-top">{renderModalities(model)}</td>
      <td className="px-4 py-4 text-left align-top">
        <div className="flex flex-col items-start gap-1 text-[11px]">
          <span className={isFreeTier ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}>
            {isFreeTier ? "✓" : "✗"} Base
          </span>
          <span className={isProTier ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}>
            {isProTier ? "✓" : "✗"} Pro
          </span>
          <span className={isEnterpriseTier ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}>
            {isEnterpriseTier ? "✓" : "✗"} Enterprise
          </span>
        </div>
      </td>
    </tr>
  );
}

interface TierSectionProps {
  tier: TierGroup;
  label: string;
  description: string;
  models: ModelCatalogClientEntry[];
  highlight: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  registerRef: (element: HTMLElement | null) => void;
}

function TierSection({
  tier,
  label,
  description,
  models,
  highlight,
  isExpanded,
  onToggle,
  registerRef,
}: TierSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVirtualized = models.length > VIRTUALIZATION_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: isVirtualized && isExpanded ? models.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 6,
  });

  const virtualItems = isVirtualized && isExpanded ? rowVirtualizer.getVirtualItems() : [];
  const containerHeight = useMemo(
    () => (isVirtualized ? clampVirtualHeight(models.length) : undefined),
    [isVirtualized, models.length]
  );

  return (
    <section
      ref={registerRef}
      className={`p-6 ${highlight ? "bg-emerald-50/60 dark:bg-emerald-500/10 transition-colors" : ""}`}
    >
      <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{label}</h3>
            <TierBadge tier={tier} showTooltip={false} />
            <span className="text-sm text-gray-500 dark:text-gray-400">{models.length} models</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-gray-600 dark:text-gray-300 cursor-pointer"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={`catalog-section-${tier}`}
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
            />
            {isExpanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      {isExpanded ? (
        <div id={`catalog-section-${tier}`} ref={containerRef}>
          {/* Mobile card layout - hidden on desktop/tablet with CSS */}
          <div
            className="block md:hidden space-y-4"
            style={isVirtualized ? { maxHeight: containerHeight, overflowY: "auto" } : undefined}
          >
            {isVirtualized ? (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                  const model = models[virtualRow.index];
                  return (
                    <div
                      key={model.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        transform: `translateY(${virtualRow.start}px)`,
                        width: "100%",
                      }}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                    >
                      <ModelCard model={model} />
                    </div>
                  );
                })}
              </div>
            ) : (
              models.map((model) => <ModelCard key={model.id} model={model} />)
            )}
          </div>

          {/* Desktop/tablet table layout - hidden on mobile with CSS */}
          <div
            className="hidden md:block overflow-x-auto"
            style={isVirtualized ? { maxHeight: containerHeight, overflowY: "auto" } : undefined}
          >
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">Context</th>
                  <th className="px-4 py-3 text-left">Input Price</th>
                  <th className="px-4 py-3 text-left">Output Price</th>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Modalities</th>
                  <th className="px-4 py-3 text-left">Access</th>
                </tr>
              </thead>
              <tbody
                className={`bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 text-sm ${
                  isVirtualized ? "relative" : ""
                }`}
              >
                {isVirtualized ? (
                  <>
                    <tr style={{ height: rowVirtualizer.getTotalSize() }}>
                      <td colSpan={7} />
                    </tr>
                    {virtualItems.map((virtualRow) => {
                      const model = models[virtualRow.index];
                      return (
                        <ModelRow
                          key={model.id}
                          model={model}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            transform: `translateY(${virtualRow.start}px)`,
                            width: "100%",
                          }}
                          measureElement={rowVirtualizer.measureElement}
                        />
                      );
                    })}
                  </>
                ) : (
                  models.map((model) => <ModelRow key={model.id} model={model} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-4 text-sm italic text-gray-500 dark:text-gray-400">
          Section collapsed — expand to view {models.length} models.
        </div>
      )}
    </section>
  );
}

export default function ModelCatalogTable({
  models,
  highlightedTier = null,
  initialSearch = "",
  initialFeatureFilters,
  initialProviderFilters,
  onFiltersChange,
}: Readonly<ModelCatalogTableProps>) {
  const [search, setSearch] = useState(initialSearch);
  const [featureState, setFeatureState] = useState<FeatureFilterState>(() => {
    const defaults = { ...DEFAULT_FEATURE_FILTER_STATE };
    if (!initialFeatureFilters || initialFeatureFilters.length === 0) {
      return defaults;
    }
    for (const feature of initialFeatureFilters) {
      if (feature in defaults) {
        defaults[feature] = true;
      }
    }
    return defaults;
  });

  const [providerState, setProviderState] = useState<ProviderFilterState>(() => {
    const defaults = CATALOG_PROVIDER_DISPLAY_ORDER.reduce<ProviderFilterState>((acc, slug) => {
      acc[slug] = false;
      return acc;
    }, {} as ProviderFilterState);
    if (!initialProviderFilters || initialProviderFilters.length === 0) return defaults;
    for (const slug of initialProviderFilters) {
      defaults[slug] = true;
    }
    return defaults;
  });

  const debouncedSearch = useDebounce(search, 250);
  const sectionRefs = useRef<Record<TierGroup, HTMLElement | null>>({
    free: null,
    pro: null,
    enterprise: null,
  });
  const [expandedSections, setExpandedSections] = useState<Record<TierGroup, boolean>>(() => {
    if (!highlightedTier) {
      return { ...DEFAULT_EXPANDED_SECTIONS };
    }
    return createSingleExpandedState(highlightedTier);
  });
  const [activeHighlight, setActiveHighlight] = useState<TierGroup | null>(null);
  const lastHighlightedTier = useRef<TierGroup | null>(highlightedTier ?? null);

  const handleFeatureToggle = useCallback((feature: FeatureFilter) => {
    setFeatureState((prev) => ({ ...prev, [feature]: !prev[feature] }));
  }, []);

  const handleProviderToggle = useCallback((provider: CatalogProviderSlug) => {
    setProviderState((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }, []);

  const toggleSection = useCallback((tier: TierGroup) => {
    setExpandedSections((prev) => ({ ...prev, [tier]: !prev[tier] }));
  }, []);

  // Sync state when URL params change (e.g., from Popular Filters navigation)
  useEffect(() => {
    // Update feature state from new props
    const newFeatureState = { ...DEFAULT_FEATURE_FILTER_STATE };
    if (initialFeatureFilters && initialFeatureFilters.length > 0) {
      for (const feature of initialFeatureFilters) {
        if (feature in newFeatureState) {
          newFeatureState[feature] = true;
        }
      }
    }
    setFeatureState((prev) => (areFeatureStatesEqual(prev, newFeatureState) ? prev : newFeatureState));

    // Update provider state from new props
    const newProviderState = CATALOG_PROVIDER_DISPLAY_ORDER.reduce<ProviderFilterState>((acc, slug) => {
      acc[slug] = false;
      return acc;
    }, {} as ProviderFilterState);
    if (initialProviderFilters && initialProviderFilters.length > 0) {
      for (const slug of initialProviderFilters) {
        newProviderState[slug] = true;
      }
    }
    setProviderState((prev) => (areProviderStatesEqual(prev, newProviderState) ? prev : newProviderState));

    // Update search from new props
    setSearch(initialSearch);
  }, [initialFeatureFilters, initialProviderFilters, initialSearch]);

  useEffect(() => {
    const filters: ModelCatalogFilters = {
      search: debouncedSearch.trim(),
      tiers: [],
      providers: toProviderArray(providerState),
      features: toFeatureArray(featureState),
    };
    onFiltersChange?.(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, featureState, providerState]);

  useEffect(() => {
    if (highlightedTier === lastHighlightedTier.current) {
      return;
    }

    if (!highlightedTier) {
      setExpandedSections({ ...DEFAULT_EXPANDED_SECTIONS });
    } else {
      setExpandedSections(createSingleExpandedState(highlightedTier));
    }

    lastHighlightedTier.current = highlightedTier ?? null;
  }, [highlightedTier]);

  useEffect(() => {
    if (!highlightedTier) return;
    const target = sectionRefs.current[highlightedTier];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveHighlight(highlightedTier);
      const timeout = setTimeout(() => {
        setActiveHighlight(null);
      }, 2400);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [highlightedTier]);

  const providerFilters = toProviderArray(providerState);
  const featureFilters = toFeatureArray(featureState);

  const filteredModels = useMemo(() => {
    const searchTerm = debouncedSearch.trim().toLowerCase();
    return models.filter((model) => {
      if (featureFilters.length > 0) {
        const matches = featureFilters.every((feature) => matchesFeatureFilter(model, feature));
        if (!matches) return false;
      }

      if (providerFilters.length > 0 && !providerFilters.includes(model.provider.slug)) {
        return false;
      }

      if (searchTerm.length > 0 && !model.searchIndex.includes(searchTerm)) {
        return false;
      }

      return true;
    });
  }, [debouncedSearch, featureFilters, models, providerFilters]);

  const groupedModels = useMemo(() => {
    return tierOrder.reduce<Record<TierGroup, ModelCatalogClientEntry[]>>((acc, tier) => {
      acc[tier] = filteredModels.filter((model) => model.tierGroup === tier);
      return acc;
    }, { free: [], pro: [], enterprise: [] });
  }, [filteredModels]);

  const totalCount = filteredModels.length;
  const noResults = totalCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="search"
                value={search}
                placeholder="Search by model, provider, or capability"
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-400/40"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <FunnelIcon className="h-5 w-5" />
              <span>{totalCount} models</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FEATURE_FILTER_OPTIONS.map(({ key, label }) => {
                const isActive = featureState[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleFeatureToggle(key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isActive
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {CATALOG_PROVIDER_DISPLAY_ORDER.map((slug) => {
                const isActive = providerState[slug];
                return (
                  <Button
                    key={slug}
                    variant={isActive ? "primary" : "ghost"}
                    size="sm"
                    type="button"
                    className={`!rounded-full border ${
                      isActive
                        ? "border-emerald-500"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                    onClick={() => handleProviderToggle(slug)}
                  >
                    {CATALOG_PROVIDER_LABELS[slug]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {noResults ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium">No models match your filters</p>
            <p className="mt-2 text-sm">Adjust your feature, provider, or search criteria to see more models.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {tierOrder.map((tier) => {
                const tierModels = groupedModels[tier];
                if (tierModels.length === 0) return null;

                return (
                  <TierSection
                    key={tier}
                    tier={tier}
                    label={tierLabels[tier]}
                    description={tierDescriptions[tier]}
                    models={tierModels}
                    highlight={activeHighlight === tier}
                    isExpanded={expandedSections[tier]}
                    onToggle={() => toggleSection(tier)}
                    registerRef={(node) => {
                      sectionRefs.current[tier] = node;
                    }}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
