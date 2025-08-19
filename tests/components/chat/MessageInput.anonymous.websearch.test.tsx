import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Anonymous: useAuth returns not authenticated
jest.mock('../../../stores/useAuthStore', () => ({ useAuth: () => ({ isAuthenticated: false }) }))

// Model selection mock (does not matter for web search)
jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: [], selectedModel: null, isEnhanced: false }),
  isEnhancedModels: () => false,
}))

// User data mock (not used when unauthenticated)
jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({ data: null, loading: false, refreshing: false, error: null, refetch: jest.fn(), updatePreferences: jest.fn(), forceRefresh: jest.fn() }),
}))

const setup = async () => {
  const mod = await import('../../../components/chat/MessageInput')
  return mod.default
}

describe('MessageInput - anonymous web search', () => {
  test('clicking web search opens upgrade modal', async () => {
    const MessageInput = await setup()
    render(<MessageInput onSendMessage={jest.fn()} />)
    const webBtn = screen.getByRole('button', { name: /web search/i })
    fireEvent.click(webBtn)
    // Upgrade modal should appear
    expect(await screen.findByText(/Upgrade to use Web Search/i)).toBeInTheDocument()
  })
})
