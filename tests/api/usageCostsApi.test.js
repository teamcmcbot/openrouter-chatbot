/** @jest-environment node */
/**
 * API handler tests for usage costs endpoints (JavaScript version to avoid TS type friction in NextRequest mocks)
 */

// Auth context mocks
const featureFlags = {
  canModifySystemPrompt: true,
  canAccessAdvancedModels: true,
  canUseCustomTemperature: true,
  canSaveConversations: true,
  canSyncConversations: true,
  maxRequestsPerHour: 1000,
  maxTokensPerRequest: 100000,
  hasRateLimitBypass: false,
  canUseProModels: true,
  canUseEnterpriseModels: false,
  showAdvancedSettings: true,
  canExportConversations: false,
  hasAnalyticsDashboard: false,
};

const mockAuthContextAuthenticated = {
  isAuthenticated: true,
  user: { id: "user-1" },
  profile: {
    id: "user-1",
    subscription_tier: "free",
    account_type: "user",
    default_model: "gpt",
    temperature: 0.7,
    system_prompt: "",
    credits: 0,
    created_at: "",
    updated_at: "",
  },
  accessLevel: "authenticated",
  features: featureFlags,
};
const mockAuthContextUnauth = {
  isAuthenticated: false,
  user: null,
  profile: null,
  accessLevel: "anonymous",
  features: featureFlags,
};
let currentAuthContext = mockAuthContextAuthenticated;

jest.mock("../../lib/utils/auth", () => ({
  extractAuthContext: jest.fn(() => currentAuthContext),
  hasPermission: jest.fn(() => true),
}));

jest.mock("../../lib/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../lib/utils/errors", () => ({
  handleError: (err) => ({
    status: 500,
    json: async () => ({ error: err.message || "error" }),
  }),
  createAuthError: (_code, message) => new Error(message),
  handleAuthError: (err) => ({
    status: 401,
    json: async () => ({ error: err.message || "auth error" }),
  }),
}));

// Build simple supabase mock
const baseRows = [
  {
    assistant_message_id: "m1",
    session_id: "s1",
    model_id: "modelA",
    message_timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
    prompt_tokens: 50,
    completion_tokens: 150,
    total_tokens: 200,
    prompt_cost: "0.010000",
    completion_cost: "0.030000",
    image_cost: "0.000000",
    total_cost: "0.040000",
    user_id: "user-1",
  },
  {
    assistant_message_id: "m2",
    session_id: "s1",
    model_id: "modelB",
    message_timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
    prompt_tokens: 20,
    completion_tokens: 80,
    total_tokens: 100,
    prompt_cost: "0.004000",
    completion_cost: "0.016000",
    image_cost: "0.000000",
    total_cost: "0.020000",
    user_id: "user-1",
  },
  {
    assistant_message_id: "m3",
    session_id: "s2",
    model_id: "modelA",
    message_timestamp: new Date().toISOString(),
    prompt_tokens: 10,
    completion_tokens: 40,
    total_tokens: 50,
    prompt_cost: "0.002000",
    completion_cost: "0.008000",
    image_cost: "0.000000",
    total_cost: "0.010000",
    user_id: "user-1",
  },
];

function buildFiltered(rows, modelId) {
  return modelId ? rows.filter((r) => r.model_id === modelId) : rows;
}

function makeQuery(rows) {
  return {
    _modelId: undefined,
    select() {
      return this;
    },
    eq(col, val) {
      if (col === "model_id") this._modelId = val;
      return this;
    },
    gte() {
      return this;
    },
    lt() {
      return this;
    },
    order() {
      return this;
    },
    range(from, to) {
      const filtered = buildFiltered(rows, this._modelId);
      return Promise.resolve({
        data: filtered.slice(from, to + 1),
        count: filtered.length,
        error: null,
      });
    },
    then(res) {
      const filtered = buildFiltered(rows, this._modelId);
      res({ data: filtered, error: null });
    },
  };
}

jest.mock("../../lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({ from: () => makeQuery(baseRows) })),
}));

// Import handlers (must come after mocks)
import { GET as getCosts } from "../../src/app/api/usage/costs/route";
import { GET as getDaily } from "../../src/app/api/usage/costs/daily/route";

function makeRequest(url) {
  return { url };
}

// Helper to unwrap NextResponse-like object or plain object
async function readResponse(res) {
  if (typeof res.json === "function") return res.json();
  return res;
}

describe("GET /api/usage/costs", () => {
  test("returns paginated items and summary", async () => {
    currentAuthContext = mockAuthContextAuthenticated;
    const res = await getCosts(
      makeRequest("http://localhost/api/usage/costs?range=7d")
    );
    const body = await readResponse(res);
    expect(body.items.length).toBeGreaterThan(0);
    const sumTokens = baseRows.reduce((a, r) => a + r.total_tokens, 0);
    expect(body.summary.total_tokens).toBe(sumTokens);
    expect(body.pagination.page).toBe(1);
  });

  test("applies model filter", async () => {
    currentAuthContext = mockAuthContextAuthenticated;
    const res = await getCosts(
      makeRequest("http://localhost/api/usage/costs?range=7d&model_id=modelA")
    );
    const body = await readResponse(res);
    expect(body.items.every((i) => i.model_id === "modelA")).toBe(true);
    const expectedTokens = baseRows
      .filter((r) => r.model_id === "modelA")
      .reduce((a, r) => a + r.total_tokens, 0);
    expect(body.summary.total_tokens).toBe(expectedTokens);
  });

  test("unauthorized when not authenticated", async () => {
    currentAuthContext = mockAuthContextUnauth;
    const res = await getCosts(
      makeRequest("http://localhost/api/usage/costs?range=7d")
    );
    const body = await readResponse(res);
    expect(res.status === 401 || body.error).toBeTruthy();
  });
});

describe("GET /api/usage/costs/daily", () => {
  test("returns daily rollups summing to total", async () => {
    currentAuthContext = mockAuthContextAuthenticated;
    const res = await getDaily(
      makeRequest("http://localhost/api/usage/costs/daily?range=7d")
    );
    const body = await readResponse(res);
    const totalFromDaily = body.items.reduce((a, d) => a + d.total_tokens, 0);
    expect(totalFromDaily).toBe(body.summary.total_tokens);
  });
});
