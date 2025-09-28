import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModelCatalogTable from "../../../components/ui/ModelCatalogTable";
import type { ModelCatalogEntry } from "../../../lib/types/modelCatalog";

jest.mock("../../../hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: jest.fn(),
    writable: true,
  });
});

describe("ModelCatalogTable", () => {
  const models: ModelCatalogEntry[] = [
    {
      id: "free-alpha",
      name: "Alpha Free",
      description: "Base tier model",
      contextLength: 1000,
      pricing: { prompt: "0", completion: "0", request: "0" },
  modalities: { input: ["text"], output: ["text"] },
  supportedParameters: [],
      provider: { slug: "openai", label: "OpenAI" },
      tiers: { free: true, pro: true, enterprise: true },
      tierGroup: "free",
      maxCompletionTokens: 1000,
      isModerated: false,
      lastSyncedAt: null,
      updatedAt: null,
    },
    {
      id: "pro-beta",
      name: "Pro Beta",
      description: "Pro tier model",
      contextLength: 2000,
      pricing: { prompt: "0.002", completion: "0.004", request: "0" },
  modalities: { input: ["text"], output: ["text", "image"] },
  supportedParameters: ["reasoning"],
      provider: { slug: "anthropic", label: "Anthropic" },
      tiers: { free: false, pro: true, enterprise: true },
      tierGroup: "pro",
      maxCompletionTokens: 2000,
      isModerated: false,
      lastSyncedAt: null,
      updatedAt: null,
    },
    {
      id: "enterprise-gamma",
      name: "Enterprise Gamma",
      description: "Enterprise tier model",
      contextLength: 5000,
      pricing: { prompt: "0.01", completion: "0.02", request: "0" },
  modalities: { input: ["text", "image"], output: ["text", "image"] },
  supportedParameters: [],
      provider: { slug: "mistral", label: "Mistral" },
      tiers: { free: false, pro: false, enterprise: true },
      tierGroup: "enterprise",
      maxCompletionTokens: 4000,
      isModerated: false,
      lastSyncedAt: null,
      updatedAt: null,
    },
  ];

  it("filters models via search input", async () => {
    const onFiltersChange = jest.fn();
    render(
      <ModelCatalogTable
        models={models}
        highlightedTier={null}
        onFiltersChange={onFiltersChange}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search by model, provider, or capability");
    fireEvent.change(searchInput, { target: { value: "Pro" } });

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Pro", tiers: [], providers: [], features: [] })
      );
      expect(screen.getByText("Pro Beta")).toBeInTheDocument();
    });

    expect(screen.queryByText("Alpha Free")).not.toBeInTheDocument();
  });

  it("filters models by feature toggles", async () => {
    const onFiltersChange = jest.fn();
    render(
      <ModelCatalogTable
        models={models}
        onFiltersChange={onFiltersChange}
      />
    );

    const paidFilter = screen.getByRole("button", { name: /Paid/i });
    fireEvent.click(paidFilter);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ features: ["paid"], providers: [], tiers: [], search: "" })
      );
      expect(screen.queryByText("Alpha Free")).not.toBeInTheDocument();
    });

    const reasoningFilter = screen.getByRole("button", { name: /Reasoning/i });
    fireEvent.click(reasoningFilter);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          features: expect.arrayContaining(["paid", "reasoning"]),
          providers: [],
          tiers: [],
          search: "",
        })
      );
      expect(screen.getByText("Pro Beta")).toBeInTheDocument();
      expect(screen.queryByText("Enterprise Gamma")).not.toBeInTheDocument();
    });
  });

  it("expands highlighted tier and collapses others", () => {
    render(
      <ModelCatalogTable
        models={models}
        highlightedTier="pro"
      />
    );

    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("Pro Beta")).toBeInTheDocument();
    expect(screen.getAllByText(/Section collapsed/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Collapse/i })).toBeInTheDocument();
  });
});
