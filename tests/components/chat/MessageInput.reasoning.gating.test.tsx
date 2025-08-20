/**
 * MessageInput reasoning gating UX tests: enterprise-only + model capability check.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Desktop defaults
beforeAll(() => {
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
})

// Mock useAuth as authenticated
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }) }))

// Mutable model capability and tier for scenarios
let mockTier: 'free'|'pro'|'enterprise' = 'free'
let mockSupportsReasoning = false

jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [{ id: 'm1', supported_parameters: mockSupportsReasoning ? ['reasoning'] : [] }], selectedModel: 'm1', isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

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

const setup = async () => {
  const mod = await import('../../../components/chat/MessageInput')
  return mod.default
}

describe('MessageInput - Reasoning gating', () => {
  beforeEach(() => { mockTier = 'free'; mockSupportsReasoning = true })

  test('Free tier: clicking Reasoning shows upgrade popover', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Upgrade to enable Reasoning/i)).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label', 'Reasoning')
  })

  test('Unsupported model: shows unsupported notice', async () => {
    mockSupportsReasoning = false
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Selected model doesn’t support reasoning/i)).toBeInTheDocument()
  })
})

describe('MessageInput - Reasoning enterprise modal', () => {
  beforeEach(() => { mockTier = 'enterprise'; mockSupportsReasoning = true })

  test('Opens settings modal and toggles ON', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Enable reasoning/i)).toBeInTheDocument()
    const toggle = screen.getByTestId('reasoning-toggle')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(btn).toHaveAttribute('aria-label', 'Reasoning: ON')
  })

  test('Escape closes modal', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /reasoning/i }))
    expect(await screen.findByText(/Enable reasoning/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/Enable reasoning/i)).not.toBeInTheDocument())
  })
})
