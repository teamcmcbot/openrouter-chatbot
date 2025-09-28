import { detectProvider, sortCatalogEntries } from "../../../lib/server/modelCatalog";
import type { ModelCatalogEntry } from "../../../lib/types/modelCatalog";

jest.mock("../../../lib/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
const baseEntry: Omit<ModelCatalogEntry, "id" | "name" | "tierGroup" | "provider"> = {
  description: "",
  contextLength: 0,
  pricing: { prompt: "0", completion: "0", request: "0" },
  modalities: { input: [], output: [] },
  supportedParameters: [],
  tiers: { free: false, pro: false, enterprise: false },
  maxCompletionTokens: null,
  isModerated: false,
  lastSyncedAt: null,
  updatedAt: null,
};

function makeEntry(
  id: string,
  name: string,
  tierGroup: ModelCatalogEntry["tierGroup"],
  providerSlug: ModelCatalogEntry["provider"]["slug"],
  providerLabel: string,
): ModelCatalogEntry {
  return {
    id,
    name,
    tierGroup,
    provider: { slug: providerSlug, label: providerLabel },
    ...baseEntry,
  };
}

describe("detectProvider", () => {
  it("maps known provider prefixes", () => {
    expect(detectProvider("openai/gpt-4o")).toBe("openai");
    expect(detectProvider("google/gemini-2.5")).toBe("google");
    expect(detectProvider("anthropic/claude-3-sonnet")).toBe("anthropic");
    expect(detectProvider("xai/grok-beta")).toBe("xai");
    expect(detectProvider("zhipu/z-forefront")).toBe("zai");
    expect(detectProvider("moonshot/moonshot-v1")).toBe("moonshot");
    expect(detectProvider("mistral/mixtral")).toBe("mistral");
  });

  it("falls back to other", () => {
    expect(detectProvider("unknown-provider/model")).toBe("other");
  });
});

describe("sortCatalogEntries", () => {
  it("orders by tier then name", () => {
    const models = [
      makeEntry("enterprise-alpha", "Enterprise Alpha", "enterprise", "other", "Other"),
      makeEntry("pro-omega", "Pro Omega", "pro", "other", "Other"),
      makeEntry("free-beta", "Free Beta", "free", "other", "Other"),
      makeEntry("pro-beta", "Pro Beta", "pro", "other", "Other"),
    ];

    const sorted = sortCatalogEntries(models);
    expect(sorted.map((entry) => entry.name)).toEqual([
      "Free Beta",
      "Pro Beta",
      "Pro Omega",
      "Enterprise Alpha",
    ]);
  });
});
