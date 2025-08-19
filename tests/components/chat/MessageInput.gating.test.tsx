/**
 * MessageInput gating UX tests: web search & image attach are tier-gated for free users.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Common mocks and helpers
beforeAll(() => {
  // Desktop by default
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  })
  // Polyfill URL.createObjectURL for jsdom
  const g = globalThis as unknown as { URL: { createObjectURL?: (f: unknown) => string } }
  if (!g.URL.createObjectURL) g.URL.createObjectURL = () => 'blob://preview'
})

// Mock useAuth as authenticated
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }) }))

// Mock model selection to support images
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [{ id: 'm1', input_modalities: ['text','image'] }], selectedModel: 'm1', isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

// Top-level mock for useUserData with mutable tier between tests
let mockTier: 'free'|'pro'|'enterprise' = 'free'
jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: { profile: { subscription_tier: mockTier } },
    loading: false,
    refreshing: false,
    error: null,
    refetch: jest.fn(),
    updatePreferences: jest.fn(),
    forceRefresh: jest.fn(),
  }),
}))

// Lazy import after mocks are defined
const setupRender = async () => {
  const mod = await import('../../../components/chat/MessageInput')
  return mod.default
}

describe('MessageInput gating (free tier)', () => {
  beforeEach(() => { mockTier = 'free' })

  test('clicking Web Search opens gating popover and does not toggle ON', async () => {
    const MessageInput = await setupRender()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const webBtn = screen.getByRole('button', { name: /web search/i })
    fireEvent.click(webBtn)
    // Gating copy visible
    expect(await screen.findByText(/Upgrade to use Web Search/i)).toBeInTheDocument()
    // Aria label stays as default (not ON)
    expect(webBtn).toHaveAttribute('aria-label', 'Web Search')
  })

  test('clicking Attach opens gating popover (images)', async () => {
    const MessageInput = await setupRender()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const attachBtn = screen.getByRole('button', { name: /attach image/i })
    fireEvent.click(attachBtn)
    // Gating popover container should exist
    expect(await screen.findByTestId('gating-popover')).toBeInTheDocument()
  })

  test('Escape closes gating', async () => {
  const MessageInput = await setupRender()
  render(<MessageInput onSendMessage={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /web search/i }))
    expect(await screen.findByText(/Upgrade to use Web Search/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/Upgrade to use Web Search/i)).not.toBeInTheDocument())
  })

  test('Outside click closes gating', async () => {
  const MessageInput = await setupRender()
  render(<MessageInput onSendMessage={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /attach image/i }))
  expect(await screen.findByTestId('gating-popover')).toBeInTheDocument()
    // Click outside
    fireEvent.pointerDown(document.body)
  await waitFor(() => expect(screen.queryByTestId('gating-popover')).not.toBeInTheDocument())
  })

  test('pasting image is gated and prevents upload', async () => {
  const MessageInput = await setupRender()
  render(<MessageInput onSendMessage={jest.fn()} />)
    const textarea = screen.getByPlaceholderText(/type your message/i)
    const originalFetch = global.fetch
    const fetchSpy = jest.spyOn(global as unknown as { fetch: typeof global.fetch }, 'fetch')
    const fakeItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => new File([new Uint8Array([1,2,3])], 'pic.png', { type: 'image/png' }),
    }
    const clipboardData = { items: [fakeItem] }
    fireEvent.paste(textarea, { clipboardData } as unknown as ClipboardEvent)
  expect(await screen.findByTestId('gating-popover')).toBeInTheDocument()
    // Should not attempt upload
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    ;(global as unknown as { fetch: typeof global.fetch }).fetch = originalFetch
  })
})

describe('MessageInput (pro tier)', () => {
  beforeEach(() => { mockTier = 'pro' })

  test('Web Search opens settings modal and toggles ON', async () => {
    const MessageInput = await setupRender()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const webBtn = screen.getByRole('button', { name: /web search/i })
    fireEvent.click(webBtn)
    // Modal visible
    expect(await screen.findByText(/Enable web search/i)).toBeInTheDocument()
    // Toggle inside modal
    const toggle = screen.getByTestId('websearch-toggle')
    fireEvent.click(toggle)
  // Close modal
  fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    // Button reflects ON state
    expect(webBtn).toHaveAttribute('aria-label', 'Web Search: ON')
    // No upgrade gating present
    expect(screen.queryByText(/Upgrade to use Web Search/i)).toBeNull()
  })
})
