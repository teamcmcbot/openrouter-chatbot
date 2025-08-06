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
  warn: jest.fn(),
  error: jest.fn(),
};
