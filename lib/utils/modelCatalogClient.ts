import type {
  FeatureFilter,
  ModelCatalogClientEntry,
  ModelCatalogEntry,
} from "../types/modelCatalog";
import type { CatalogProviderSlug } from "../constants/modelProviders";

const DESCRIPTION_LIMIT = 220;
const MODALITY_LIMIT = 4;

interface TokenPriceDisplay {
  display: string;
  unit: string;
}

function clampDescription(description: string | null | undefined): string {
  if (!description) return "";
  const trimmed = description.trim();
  if (trimmed.length <= DESCRIPTION_LIMIT) {
    return trimmed;
  }
  const slice = trimmed.slice(0, DESCRIPTION_LIMIT);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > DESCRIPTION_LIMIT * 0.6) {
    return `${slice.slice(0, lastSpace)}…`;
  }
  return `${slice}…`;
}

function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return "—";
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toLocaleString();
}

function toNumber(price: string | null | undefined): number | null {
  if (price == null || price === "") return null;
  const parsed = Number(price);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatScaledPrice(value: number, scale: number): string {
  const scaled = value * scale;
  if (!Number.isFinite(scaled)) {
    return value.toString();
  }

  let maximumFractionDigits: number;
  if (scaled >= 100) {
    maximumFractionDigits = 0;
  } else if (scaled >= 10) {
    maximumFractionDigits = 1;
  } else if (scaled >= 1) {
    maximumFractionDigits = 2;
  } else if (scaled >= 0.1) {
    maximumFractionDigits = 3;
  } else {
    maximumFractionDigits = 4;
  }

  const minimumFractionDigits = maximumFractionDigits <= 1 ? maximumFractionDigits : 2;

  return scaled.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

function formatTokenPrice(price: string | null | undefined): TokenPriceDisplay {
  if (!price) {
    return { display: "—", unit: "per 1M tokens" };
  }

  const parsed = Number(price);
  if (Number.isNaN(parsed)) {
    return { display: price, unit: "per 1M tokens" };
  }

  if (parsed === 0) {
    return { display: "Free", unit: "per 1M tokens" };
  }

  if (parsed >= 1) {
    return {
      display: `$${parsed.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      unit: "per token",
    };
  }

  return {
    display: `$${formatScaledPrice(parsed, 1_000_000)}`,
    unit: "per 1M tokens",
  };
}

function formatImageTokenPrice(price: string | null | undefined): TokenPriceDisplay | null {
  if (!price) return null;
  const parsed = Number(price);
  if (Number.isNaN(parsed) || parsed <= 0) return null;

  return {
    display: `$${formatScaledPrice(parsed, 1_000)}`,
    unit: "per 1K image tokens",
  };
}

function extractModalities(model: ModelCatalogEntry): { modalities: string[]; extra: number } {
  const set = new Set<string>();
  for (const value of model.modalities?.input ?? []) {
    if (typeof value === "string" && value.trim()) {
      set.add(value.trim());
    }
  }
  for (const value of model.modalities?.output ?? []) {
    if (typeof value === "string" && value.trim()) {
      set.add(value.trim());
    }
  }
  const unique = Array.from(set);
  unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const modalities = unique.slice(0, MODALITY_LIMIT);
  const extra = unique.length - modalities.length;
  return { modalities, extra: extra > 0 ? extra : 0 };
}

function buildSearchIndex(model: ModelCatalogEntry, description: string): string {
  return [model.name, model.id, description, model.provider.label]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectFlags(model: ModelCatalogEntry) {
  const prompt = toNumber(model.pricing.prompt);
  const completion = toNumber(model.pricing.completion);
  const isFree = (prompt ?? 0) === 0 && (completion ?? 0) === 0;
  const isPaid = (prompt ?? 0) > 0 || (completion ?? 0) > 0;

  const modalities = new Set([
    ...(model.modalities?.input ?? []),
    ...(model.modalities?.output ?? []),
  ]);
  const multimodal = modalities.size > 1;

  const reasoning = model.supportedParameters?.some(
    (param) => typeof param === "string" && param.toLowerCase() === "reasoning"
  );

  const image = model.modalities?.output?.some(
    (modality) => typeof modality === "string" && modality.toLowerCase() === "image"
  );

  return { isFree, isPaid, multimodal, reasoning: Boolean(reasoning), image: Boolean(image) };
}

export function mapModelToClientEntry(model: ModelCatalogEntry): ModelCatalogClientEntry {
  const description = clampDescription(model.description ?? model.name ?? model.id);
  const { modalities, extra } = extractModalities(model);
  const flags = detectFlags(model);
  const promptPrice = formatTokenPrice(model.pricing.prompt);
  const completionPrice = formatTokenPrice(model.pricing.completion);
  const imagePrice = formatImageTokenPrice(model.pricing.outputImage);

  return {
    id: model.id,
    name: model.name,
    description,
    provider: model.provider,
    tierGroup: model.tierGroup,
    tiers: model.tiers,
    contextTokens: model.contextLength,
    contextDisplay: model.contextLength ? formatNumber(model.contextLength) : "—",
    pricing: {
      promptDisplay: promptPrice.display,
      promptUnit: promptPrice.unit,
      completionDisplay: completionPrice.display,
      completionUnit: completionPrice.unit,
      imageDisplay: imagePrice?.display ?? null,
      imageUnit: imagePrice?.unit ?? null,
    },
    flags,
    modalities,
    modalitiesExtra: extra,
    searchIndex: buildSearchIndex(model, description),
    updatedAt: model.updatedAt ?? null,
  };
}

export function buildClientCatalog(models: ModelCatalogEntry[]): ModelCatalogClientEntry[] {
  return models.map(mapModelToClientEntry);
}

export function matchesFeatureFilter(
  model: ModelCatalogClientEntry,
  feature: FeatureFilter
): boolean {
  switch (feature) {
    case "free":
      return model.flags.isFree;
    case "paid":
      return model.flags.isPaid;
    case "multimodal":
      return model.flags.multimodal;
    case "reasoning":
      return model.flags.reasoning;
    case "image":
      return model.flags.image;
    default:
      return false;
  }
}

export function countClientModels(
  models: ModelCatalogClientEntry[],
  featureFilter?: FeatureFilter,
  providerFilter?: CatalogProviderSlug
): number {
  return models.filter((model) => {
    if (providerFilter && model.provider.slug !== providerFilter) {
      return false;
    }
    if (!featureFilter) return true;
    return matchesFeatureFilter(model, featureFilter);
  }).length;
}
