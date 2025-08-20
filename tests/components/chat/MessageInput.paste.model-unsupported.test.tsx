/**
 * MessageInput paste behavior: pro/enterprise tier + text-only model should toast on image paste.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  }
}))

type ToastSpies = { error: jest.Mock; success: jest.Mock; loading: jest.Mock; dismiss: jest.Mock }
let toastSpies: ToastSpies
beforeAll(async () => {
  const mod = await import('react-hot-toast')
  toastSpies = mod.default as unknown as ToastSpies
  // Polyfill URL.createObjectURL for jsdom
  const g = globalThis as unknown as { URL: { createObjectURL?: (f: unknown) => string } }
  if (!g.URL.createObjectURL) g.URL.createObjectURL = () => 'blob://preview'
})

// Authenticated user
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }) }))

// Model selection: selected model does NOT support images
const TEXT_ONLY_MODEL = { id: 'text-only-model', label: 'Text Only Model', input_modalities: ['text'] }
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [TEXT_ONLY_MODEL], selectedModel: 'text-only-model', isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

// User tier: pro (allows images), so gating should not show; should toast due to model limitation
jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: { profile: { subscription_tier: 'pro' } },
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

describe('MessageInput paste - text-only model toast', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('pasting image triggers toast and prevents upload', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)

    const textarea = screen.getByPlaceholderText(/type your message/i)

    // Spy on global fetch to ensure no upload occurs
    const originalFetch = global.fetch
    const fetchSpy = jest.spyOn(global as unknown as { fetch: typeof global.fetch }, 'fetch')

    const fakeItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => new File([new Uint8Array([1,2,3])], 'pic.png', { type: 'image/png' }),
    }
    const clipboardData = { items: [fakeItem] }

    fireEvent.paste(textarea, { clipboardData } as unknown as ClipboardEvent)

    await waitFor(() => {
      expect(toastSpies.error).toHaveBeenCalled()
    })
    // Toast message includes model label exactly as specified
    const lastCall = toastSpies.error.mock.calls.at(-1)?.[0] as string | undefined
    expect(lastCall).toContain('Text Only Model')
    expect(lastCall).toMatch(/does not support image input\.?$/i)

    // No upload attempted
    expect(fetchSpy).not.toHaveBeenCalled()

    // No upgrade gating popover for pro tier
    expect(screen.queryByTestId('gating-popover')).toBeNull()

    fetchSpy.mockRestore()
    ;(global as unknown as { fetch: typeof global.fetch }).fetch = originalFetch
  })
})
