import { render, screen } from '@testing-library/react';

// Mock Next.js navigation first, before importing the component
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock react-hot-toast to prevent toast-related issues
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock the auth store with minimal data
jest.mock('../../../stores/useAuthStore', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
  }),
}));

// Mock the useUserData hook with minimal data
jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
    updatePreferences: jest.fn(),
    forceRefresh: jest.fn(),
  }),
}));

// Mock validation utilities
jest.mock('../../../lib/utils/validation/systemPrompt', () => ({
  validateSystemPrompt: () => ({
    isValid: true,
    trimmedValue: 'You are a helpful AI assistant.',
  }),
  truncateAtWordBoundary: (text: string) => text,
  SYSTEM_PROMPT_LIMITS: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 1000,
  },
}));

// Import the component after all mocks are set up
import UserSettings from '../../../components/ui/UserSettings';

describe('UserSettings', () => {
  it('renders when open', () => {
    render(<UserSettings isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('User Settings')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(<UserSettings isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
