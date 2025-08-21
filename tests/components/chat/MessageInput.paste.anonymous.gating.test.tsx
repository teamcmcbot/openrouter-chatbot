/**
 * MessageInput paste behavior: anonymous user + multimodal model → upgrade popover, no upload.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Anonymous user
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: false }) }))

// Model selection: selected model supports images
const MULTIMODAL_MODEL = { id: 'mm', label: 'Multimodal Model', input_modalities: ['text', 'image'] }
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [MULTIMODAL_MODEL], selectedModel: 'mm', isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

// User data (not used for anonymous)
jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: null,
    loading: false,
    refreshing: false,
    error: null,
    refetch: jest.fn(),
    updatePreferences: jest.fn(),
    forceRefresh: jest.fn(),
  }),
}))

beforeAll(() => {
  // Desktop viewport + matchMedia mock
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
  // Polyfill URL.createObjectURL
  const g = globalThis as unknown as { URL: { createObjectURL?: (f: unknown) => string } }
  if (!g.URL.createObjectURL) g.URL.createObjectURL = () => 'blob://preview'
})

const setup = async () => {
  const mod = await import('../../../components/chat/MessageInput')
  return mod.default
}

describe('MessageInput paste - anonymous gating (multimodal model)', () => {
  test('pasting image opens upgrade popover and prevents upload', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)

    const textarea = screen.getByPlaceholderText(/type your message/i)

    // Spy on fetch to ensure no upload happens
    const originalFetch = global.fetch
    const fetchSpy = jest.spyOn(global as unknown as { fetch: typeof global.fetch }, 'fetch')

    const fakeItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => new File([new Uint8Array([1,2,3])], 'pic.png', { type: 'image/png' }),
    }
    const clipboardData = { items: [fakeItem] }

    fireEvent.paste(textarea, { clipboardData } as unknown as ClipboardEvent)

    // Upgrade popover for images should appear
    expect(await screen.findByTestId('gating-popover')).toBeInTheDocument()

    // No upload attempted
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    ;(global as unknown as { fetch: typeof global.fetch }).fetch = originalFetch
  })
})
