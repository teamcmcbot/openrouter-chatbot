/**
 * MessageInput upload UX tests: toasts on validation and 429, and failed tile exclusion.
 */
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react'
// We'll require MessageInput after mocks are set up

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
  if (!g.URL.createObjectURL) {
    g.URL.createObjectURL = () => 'blob://preview'
  }
})

// Mock useAuth and useModelSelection to enable attachments
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [{ id: 'm1', input_modalities: ['text','image'] }], selectedModel: 'm1', isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

// Ensure File#arrayBuffer exists in jsdom
beforeAll(() => {
  const F: unknown = (globalThis as unknown as { File?: unknown }).File
  if (F && !(F as { prototype: { arrayBuffer?: () => Promise<ArrayBuffer> } }).prototype.arrayBuffer) {
    Object.defineProperty((F as { prototype: { [k: string]: unknown } }).prototype, 'arrayBuffer', {
      value: function() { return Promise.resolve(new Uint8Array([1,2,3]).buffer) },
      configurable: true,
    })
  }
})

// Utilities
const setup = async (onSend = jest.fn()) => {
  const mod = await import('../../../components/chat/MessageInput')
  const MessageInput = mod.default
  return render(<MessageInput onSendMessage={onSend} />)
}

describe('MessageInput upload toasts', () => {
  beforeEach(() => { jest.resetAllMocks(); toastSpies.error?.mockReset?.(); toastSpies.success?.mockReset?.(); toastSpies.loading?.mockReset?.(); toastSpies.dismiss?.mockReset?.(); })

  test('client validation toast for bad type', async () => {
  const { container, getByPlaceholderText } = await setup()
    // Expand MessageInput to show feature buttons
    const textarea = getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy() // Ensure input exists
    const file = new File([new Uint8Array([1,2,3])], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
  await waitFor(() => expect(toastSpies.error).toHaveBeenCalled())
  })

  test('429 triggers toast and tile stays failed', async () => {
    // Mock fetch to return 429 once
    const originalFetch = global.fetch
    ;(global as unknown as { fetch: unknown }).fetch = (async () => ({ ok: false, status: 429, headers: new Map([['Retry-After','10']]), json: async () => ({ error: 'Rate limited' }), text: async () => 'Rate limited' })) as unknown as typeof global.fetch
  const { container, findAllByText, getByPlaceholderText } = await setup()
    // Expand MessageInput to show feature buttons
    const textarea = getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy() // Ensure input exists
    const file = new File([new Uint8Array([1,2,3])], 'pic.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
  await waitFor(() => expect(toastSpies.error).toHaveBeenCalled())
    // UI shows "Upload failed" badge
    const badges = await findAllByText(/Upload failed/i)
    expect(badges.length).toBeGreaterThan(0)
  // restore
  ;(global as unknown as { fetch: unknown }).fetch = originalFetch as unknown as typeof global.fetch
  })
})
