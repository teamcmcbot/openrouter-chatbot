import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ModelCatalogTable from "../../../components/ui/ModelCatalogTable";
import { buildClientCatalog } from "../../../lib/utils/modelCatalogClient";
import type { ModelCatalogClientEntry, ModelCatalogEntry } from "../../../lib/types/modelCatalog";

jest.mock("../../../hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

beforeAll(() => {
  // Note: Both mobile cards and desktop table render in tests
  // We'll query within the table container to avoid selecting mobile elements

  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: jest.fn(),
    writable: true,
  });

  class ResizeObserverMock {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: target.getBoundingClientRect(),
          } as ResizeObserverEntry,
        ],
        this
      );
    }

    unobserve() {}
    disconnect() {}
  }

  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverMock as typeof ResizeObserver;
});

describe("ModelCatalogTable", () => {
  const rawModels: ModelCatalogEntry[] = [
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
  pricing: { prompt: "0.002", completion: "0.004", request: "0", outputImage: "0.00003" },
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

  const models: ModelCatalogClientEntry[] = buildClientCatalog(rawModels);

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
      // Query within the table container to avoid selecting mobile cards
      const tableContainer = screen.getByRole('table').closest('div');
      expect(within(tableContainer!).getByText("Pro Beta")).toBeInTheDocument();
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
      // Query within table to avoid mobile cards
      const tableContainer = screen.getByRole('table').closest('div');
      expect(within(tableContainer!).getByText("Pro Beta")).toBeInTheDocument();
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

    // Both mobile and desktop render, query the table specifically
    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThanOrEqual(1);
    
    const tableContainer = tables[0].closest('div');
    expect(within(tableContainer!).getByText("Pro Beta")).toBeInTheDocument();
    expect(screen.getAllByText(/Section collapsed/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Collapse/i })).toBeInTheDocument();
  });

  it("displays per-million token prices and image token pricing", () => {
    render(<ModelCatalogTable models={models} />);

    // There are multiple tables (one per tier), query within the pro tier table
    const tables = screen.getAllByRole('table');
    const proTableContainer = tables.find(table => 
      within(table).queryByText("Pro Beta") !== null
    );
    expect(proTableContainer).toBeDefined();
    
    const proRow = within(proTableContainer!).getByText("Pro Beta").closest("tr");
    expect(proRow).not.toBeNull();

    const proRowScope = within(proRow!);

    expect(proRowScope.getByText("$2,000")).toBeInTheDocument();
    expect(proRowScope.getByText("$4,000")).toBeInTheDocument();
    expect(proRowScope.getAllByText("per 1M tokens")).toHaveLength(2);
    expect(proRowScope.getByText("$0.03")).toBeInTheDocument();
    expect(proRowScope.getByText("per 1K image tokens")).toBeInTheDocument();
  });

  it("virtualizes large tier sections to limit DOM nodes", () => {
    const bulkRaw: ModelCatalogEntry[] = Array.from({ length: 45 }, (_, index) => ({
      id: `free-bulk-${index}`,
      name: `Free Bulk ${index}`,
      description: "Bulk generated model",
      contextLength: 4000,
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
    }));

    const bulkModels = buildClientCatalog([...rawModels, ...bulkRaw]);

    render(<ModelCatalogTable models={bulkModels} />);

    const freeSection = screen.getByText("Base (Free)").closest("section");
    expect(freeSection).not.toBeNull();

    const table = within(freeSection!).getByRole("table");
    const scrollContainer = table.parentElement as HTMLElement;

    expect(scrollContainer.style.maxHeight).not.toEqual("");
    expect(scrollContainer.style.overflowY).toBe("auto");
  });
});
