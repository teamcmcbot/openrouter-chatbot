/**
 * MessageInput paste behavior: universal toast on model-unsupported image paste (anonymous & free tiers too).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock toast to capture error
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}))

type ToastSpies = { error: jest.Mock }
let toastSpies: ToastSpies
beforeAll(async () => {
  const mod = await import('react-hot-toast')
  toastSpies = mod.default as unknown as ToastSpies
  // Polyfill URL.createObjectURL
  const g = globalThis as unknown as { URL: { createObjectURL?: (f: unknown) => string } }
  if (!g.URL.createObjectURL) g.URL.createObjectURL = () => 'blob://preview'
})

// Anonymous user
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: false }) }))

// Model selection: selected text-only model
const TEXT_ONLY_MODEL = { id: 'text-only', label: 'Text Only', input_modalities: ['text'] }
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [TEXT_ONLY_MODEL], selectedModel: 'text-only', isEnhanced: false }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

// User data (unused for anonymous)
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

const setup = async () => {
  const mod = await import('../../../components/chat/MessageInput')
  return mod.default
}

describe('MessageInput universal toast - model unsupported', () => {
  beforeEach(() => { jest.resetAllMocks() })

  test('pasting image shows toast for anonymous (no upload, no upgrade popover)', async () => {
    const MessageInput = await setup()
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

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled())
    const msg = toastSpies.error.mock.calls.at(-1)?.[0] as string | undefined
    expect(msg).toMatch(/does not support image input/i)

    // No upload attempted
    expect(fetchSpy).not.toHaveBeenCalled()

    // No gating popover; we only toast
    expect(screen.queryByTestId('gating-popover')).toBeNull()

    fetchSpy.mockRestore()
    ;(global as unknown as { fetch: typeof global.fetch }).fetch = originalFetch
  })
})
