import "@testing-library/jest-dom";

// Mock Supabase client
jest.mock("./lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithOAuth: jest.fn(() =>
        Promise.resolve({ data: {}, error: null })
      ),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
  },
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithOAuth: jest.fn(() =>
        Promise.resolve({ data: {}, error: null })
      ),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
  })),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";

// Mock fetch for API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Polyfills for Node test env
try {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
} catch {}

try {
  if (typeof global.ReadableStream === "undefined") {
    const { ReadableStream } = require("stream/web");
    global.ReadableStream = ReadableStream;
  }
  if (typeof global.TransformStream === "undefined") {
    const { TransformStream } = require("stream/web");
    global.TransformStream = TransformStream;
  }
} catch {}

// Ensure WHATWG Request/Response/Headers exist for next/server
try {
  const { Request, Response, Headers, fetch } = require("undici");
  if (typeof global.Request === "undefined") global.Request = Request;
  if (typeof global.Response === "undefined") global.Response = Response;
  if (typeof global.Headers === "undefined") global.Headers = Headers;
  // Do not override existing jest fetch mock; only set if missing
  if (typeof global.fetch === "undefined") global.fetch = fetch;
} catch {}

// Fallback minimal Response if still undefined (tests only)
if (typeof global.Response === "undefined") {
  // Minimal shim sufficient for handleError usage in tests
  global.Response = class {
    constructor(body, init) {
      this.body = body;
      this.status = (init && init.status) || 200;
      this.statusText = (init && init.statusText) || "OK";
      this.headers = (init && init.headers) || {};
    }
  };
}
