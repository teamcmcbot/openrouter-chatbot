import { AuthContext } from "../../lib/types/auth";
import type { User } from "@supabase/supabase-js";
// getOpenRouterCompletion is dynamically imported per test after env vars are set

// Mock server/models to avoid cookies() call
jest.mock("../../lib/server/models", () => ({
  getServerModelConfig: jest.fn().mockResolvedValue({
    id: "test-model",
    name: "Test Model",
    pricing: { prompt: "0", completion: "0" },
    context_length: 4096,
    supported_parameters: {},
  }),
  doesModelSupportParameter: jest.fn().mockResolvedValue(true),
}));

// Mock fetch to capture request payload
let originalFetch: typeof global.fetch;

describe("OpenRouter user tracking", () => {
  const originalFlag = process.env.OPENROUTER_USER_TRACKING;
  beforeAll(() => {
    originalFetch = global.fetch;
    const fetchImpl = async (...args: unknown[]) => {
      void args; // prevent unused var lint warning
      const payload = {
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      return {
        ok: true,
        json: async () => payload,
      } as const;
    };
    global.fetch = jest.fn(fetchImpl) as unknown as typeof global.fetch;
  });

  beforeEach(() => {
    // reset mock call history so each test inspects its own invocation
    (global.fetch as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  if (originalFlag === undefined) delete process.env.OPENROUTER_USER_TRACKING;
  else process.env.OPENROUTER_USER_TRACKING = originalFlag;
  });

  it("sends user when enabled and authenticated", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_USER_TRACKING = "true";

    const fakeUser: Partial<User> = { id: "user_abc" };
    const authContext: Partial<AuthContext> = {
      isAuthenticated: true,
      user: fakeUser as User,
    };

    const bodySpy = jest.spyOn(global, "fetch");

  const { getOpenRouterCompletion } = await import("../../lib/utils/openrouter");
  await getOpenRouterCompletion(
      [{ role: "user", content: "hi" }],
      "test-model",
      32,
      0.1,
      undefined,
      authContext as AuthContext
    );

    expect(bodySpy).toHaveBeenCalled();
    const args = (bodySpy as jest.Mock).mock.calls[0];
    const init = args[1];
    const sent = JSON.parse(init.body);
    expect(sent.user).toBe("user_abc");
  });

  it("omits user when disabled", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_USER_TRACKING = "false";

    const fakeUser: Partial<User> = { id: "user_abc" };
    const authContext: Partial<AuthContext> = {
      isAuthenticated: true,
      user: fakeUser as User,
    };

    const bodySpy = jest.spyOn(global, "fetch");

  const { getOpenRouterCompletion } = await import("../../lib/utils/openrouter");
  await getOpenRouterCompletion(
      [{ role: "user", content: "hi" }],
      "test-model",
      32,
      0.1,
      undefined,
      authContext as AuthContext
    );

    const args = (bodySpy as jest.Mock).mock.calls[0];
    const init = args[1];
    const sent = JSON.parse(init.body);
    expect(sent.user).toBeUndefined();
  });

  it("omits user when anonymous", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_USER_TRACKING = "true";

    const authContext: Partial<AuthContext> = {
      isAuthenticated: false,
      user: null,
    };

    const bodySpy = jest.spyOn(global, "fetch");

  const { getOpenRouterCompletion } = await import("../../lib/utils/openrouter");
  await getOpenRouterCompletion(
      [{ role: "user", content: "hi" }],
      "test-model",
      32,
      0.1,
      undefined,
      authContext as AuthContext
    );

    const args = (bodySpy as jest.Mock).mock.calls[0];
    const init = args[1];
    const sent = JSON.parse(init.body);
    expect(sent.user).toBeUndefined();
  });
});
