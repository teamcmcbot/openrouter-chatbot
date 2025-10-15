import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Desktop defaults
beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
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
  });
});

// Authenticated user
jest.mock('../../../stores/useAuthStore', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }),
}));

// Tier + models controlled by test
let mockTier: 'free' | 'pro' | 'enterprise' = 'enterprise';
let mockSelectedModel = 'm1';

// Provide two models that both support reasoning; search gating uses tier
const mockModels = [
  { id: 'm1', name: 'Model One', supported_parameters: ['reasoning'], input_modalities: ['text', 'image'] },
  { id: 'm2', name: 'Model Two', supported_parameters: ['reasoning'], input_modalities: ['text', 'image'] },
];

jest.mock('../../../stores', () => ({
  useModelSelection: () => ({ availableModels: mockModels, selectedModel: mockSelectedModel, isEnhanced: true }),
  isEnhancedModels: (arr: unknown) => Array.isArray(arr),
}));

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
}));

const loadComponent = async () => {
  const mod = await import('../../../components/chat/MessageInput');
  return mod.default;
};

/**
 * Helper: turn on both toggles via their settings popovers
 */
async function enableBothToggles() {
  // First, expand the MessageInput to show feature buttons
  const textarea = screen.getByPlaceholderText(/type your message/i);
  fireEvent.focus(textarea);
  
  // Open Web Search settings and toggle on
  const webBtn = screen.getByRole('button', { name: /web search/i });
  fireEvent.click(webBtn);
  const webToggle = await screen.findByTestId('websearch-toggle');
  fireEvent.click(webToggle);
  // Close modal
  fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));

  // Open Reasoning settings and toggle on
  const reasoningBtn = screen.getByRole('button', { name: /reasoning/i });
  fireEvent.click(reasoningBtn);
  const reasoningToggle = await screen.findByTestId('reasoning-toggle');
  fireEvent.click(reasoningToggle);
  // Close modal
  fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));

  // Validate ON state reflected on main buttons
  expect(screen.getByRole('button', { name: 'Web Search: ON' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reasoning: ON' })).toBeInTheDocument();
}

describe('MessageInput - toggle reset on model change', () => {
  beforeEach(() => {
    mockTier = 'enterprise';
    mockSelectedModel = 'm1';
  });

  test('Resets both toggles when selecting a different model', async () => {
    const MessageInput = await loadComponent();
    const { rerender } = render(<MessageInput onSendMessage={jest.fn()} />);

    await enableBothToggles();

    // Change selected model
    mockSelectedModel = 'm2';
    rerender(<MessageInput onSendMessage={jest.fn()} />);

    // Buttons should reflect OFF after reset
    expect(screen.getByRole('button', { name: /^Web Search$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reasoning$/i })).toBeInTheDocument();
  });

  test('Keeps toggle states when re-selecting the same model', async () => {
    const MessageInput = await loadComponent();
    const { rerender } = render(<MessageInput onSendMessage={jest.fn()} />);

    await enableBothToggles();

    // Re-select the same model (no change)
    mockSelectedModel = 'm1';
    rerender(<MessageInput onSendMessage={jest.fn()} />);

    // Should remain ON
    expect(screen.getByRole('button', { name: 'Web Search: ON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reasoning: ON' })).toBeInTheDocument();
  });
});
