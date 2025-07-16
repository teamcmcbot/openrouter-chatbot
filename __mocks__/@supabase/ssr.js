// Mock for @supabase/ssr
export const createBrowserClient = () => ({
  auth: {
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: null }, error: null })
    ),
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    })),
    signInWithOAuth: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
  },
});

export const createServerClient = () => ({
  auth: {
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: null }, error: null })
    ),
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    })),
    signInWithOAuth: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
  },
});
