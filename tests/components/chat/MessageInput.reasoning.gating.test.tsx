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
const mockState = {
  tier: 'free' as 'free'|'pro'|'enterprise',
  supportsReasoning: false
}

const mockUseModelSelection = jest.fn(() => ({ 
  availableModels: [{ 
    id: 'm1', 
    supported_parameters: mockState.supportsReasoning ? ['reasoning'] : [] 
  }], 
  selectedModel: 'm1', 
  isEnhanced: true 
}))

jest.mock('../../../stores', () => ({
  useModelSelection: () => mockUseModelSelection(),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}))

jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: { profile: { subscription_tier: mockState.tier } },
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
  beforeEach(() => { 
    mockState.tier = 'free'
    mockState.supportsReasoning = true
  })

  test('Free tier: clicking Reasoning shows upgrade popover', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    // Expand MessageInput to show feature buttons
    const textarea = screen.getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
    const btn = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Upgrade to enable Reasoning/i)).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label', 'Reasoning')
  })
})

describe('MessageInput - Reasoning unsupported model', () => {
  beforeEach(() => {
    mockState.tier = 'free'
    mockState.supportsReasoning = false
  })

  test('Unsupported model: shows unsupported notice', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    // Expand MessageInput to show feature buttons
    const textarea = screen.getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
    const btn = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(btn)
    // Look for the popover with the unsupported text (using curly apostrophe)
    expect(await screen.findByTestId('gating-popover')).toBeInTheDocument()
    expect(screen.getByText(/support reasoning/i)).toBeInTheDocument()
  })
})

describe('MessageInput - Reasoning enterprise modal', () => {
  beforeEach(() => { mockState.tier = 'enterprise'; mockState.supportsReasoning = true })

  test('Opens settings modal and toggles ON', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    // Expand MessageInput to show feature buttons
    const textarea = screen.getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
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
    // Expand MessageInput to show feature buttons
    const textarea = screen.getByPlaceholderText(/type your message/i)
    fireEvent.focus(textarea)
    fireEvent.click(screen.getByRole('button', { name: /reasoning/i }))
    expect(await screen.findByText(/Enable reasoning/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/Enable reasoning/i)).not.toBeInTheDocument())
  })
})
