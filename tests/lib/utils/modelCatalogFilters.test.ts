import {
  parseFeatureFilters,
  parseProviderFilters,
  parseTier,
  parseTierFilters,
  VALID_FEATURE_FILTERS,
  VALID_TIERS,
} from "../../../lib/utils/modelCatalogFilters";

describe("modelCatalogFilters", () => {
  it("returns null for invalid tier", () => {
    expect(parseTier(undefined)).toBeNull();
    expect(parseTier("unknown")).toBeNull();
  });

  it("parses tier from string or array", () => {
    expect(parseTier("free")).toBe("free");
    expect(parseTier(["pro", "free"])).toBe("pro");
  });

  it("parses tier filters and drops invalid entries", () => {
    expect(parseTierFilters("free,enterprise,invalid")).toEqual(["free", "enterprise"]);
    expect(parseTierFilters(["pro", "other"])).toEqual(["pro"]);
  });

  it("parses provider filters case-insensitively", () => {
    expect(parseProviderFilters("OpenAI,Google, foo")).toEqual(["openai", "google"]);
    expect(parseProviderFilters(["Anthropic", "moonshot", "invalid"])).toEqual(["anthropic", "moonshot"]);
  });

  it("parses feature filters and ignores invalid entries", () => {
    expect(parseFeatureFilters("FREE,paid,invalid"))
      .toEqual(["free", "paid"]);
    expect(parseFeatureFilters(["multimodal", "image", "unknown"])).toEqual(["multimodal", "image"]);
  });

  it("exposes list of valid tiers for reference", () => {
    expect(Array.from(VALID_TIERS)).toEqual(["free", "pro", "enterprise"]);
  });

  it("exposes list of valid feature filters", () => {
    expect(Array.from(VALID_FEATURE_FILTERS)).toEqual(["multimodal", "reasoning", "image", "free", "paid"]);
  });
});
