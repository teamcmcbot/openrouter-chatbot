import { renderHook, act, waitFor } from "@testing-library/react";
import { useUserData } from "../../hooks/useUserData";

// Helpers to control fetch behavior
const nextTick = () => new Promise((r) => setTimeout(r, 0));

// Mock useAuth used by the hook
jest.mock("../../stores/useAuthStore", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isAuthenticated: true,
  }),
}));

type MockResponse = Partial<Response> & { ok: boolean; json: () => Promise<unknown> };

// Allow swapping fetch implementations per test
const originalFetch = global.fetch;

// Clear module-level caches between tests to avoid cross-test pollution
const clearGlobalUserDataCaches = () => {
  const g = globalThis as unknown as {
    __userDataCache?: Map<string, unknown>;
    __userDataInFlight?: Map<string, Promise<unknown>>;
  };
  g.__userDataCache?.clear?.();
  g.__userDataInFlight?.clear?.();
};

describe("useUserData dedupe and refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalUserDataCaches();
  });

  afterAll(() => {
    global.fetch = originalFetch as unknown as typeof fetch;
  });

  it("coalesces concurrent initial fetches into one GET", async () => {
    // Arrange: slow first response to create overlap
    const responses: MockResponse[] = [
      { ok: true, json: async () => ({ preferences: { ui: { theme: "dark" } } }) },
    ];
    const fetchSpy = jest.fn(async () => {
      const res = responses.shift() as MockResponse;
      // slow a bit to ensure overlap
      await new Promise((r) => setTimeout(r, 5));
      return res as unknown as Response;
    }) as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchSpy as unknown as typeof fetch;

    // Act: mount two consumers at once
    const h1 = renderHook(() => useUserData({ enabled: true }));
    const h2 = renderHook(() => useUserData({ enabled: true }));

    // Wait for both to receive data
    await waitFor(() => expect(h1.result.current.data).toBeTruthy());
    await waitFor(() => expect(h2.result.current.data).toBeTruthy());

    // Assert: only one network GET to /api/user/data
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/user/data", expect.any(Object));
  });

  it("enabled fetch + forceRefresh overlap still one GET", async () => {
    // Arrange: single response for both callers
    const fetchSpy = jest.fn(async () => ({
      ok: true,
      json: async () => ({ preferences: { ui: { theme: "light" } } }),
    } as MockResponse)) as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const h = renderHook(() => useUserData({ enabled: true }));

    // Trigger a concurrent forceRefresh right away
    await act(async () => {
      const p1 = nextTick();
      const p2 = h.result.current.forceRefresh();
      await Promise.all([p1, p2]);
    });

    // Assert: still deduped to a single GET
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("subsequent forceRefresh after resolve issues a new GET", async () => {
    const fetchSpy = (jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ v: 1 }),
      } as MockResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ v: 2 }),
      } as MockResponse)) as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useUserData({ enabled: true }));

    // Wait initial
    await act(async () => {
      await nextTick();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Now force refresh after the first resolved
    await act(async () => {
      await result.current.forceRefresh();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
