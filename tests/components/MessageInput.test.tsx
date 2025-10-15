import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageInput from '../../components/chat/MessageInput';

// Mock stores and hooks
jest.mock('../../stores/useAuthStore', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isEnterprise: false,
  }),
}));

jest.mock('../../stores/useModelStore', () => ({
  useModelSelection: () => ({
    selectedModel: null,
    availableModels: [],
  }),
}));

jest.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: () => ({
    getSetting: () => false,
    setSetting: jest.fn(),
  }),
}));

jest.mock('../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: null,
    loading: false,
    error: null,
  }),
}));

jest.mock('../../hooks/useBanStatus', () => ({
  useBanStatus: () => ({
    isBanned: false,
    isLoading: false,
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('MessageInput', () => {
  it('renders message input with default placeholder', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    expect(textarea).toBeInTheDocument();
  });

  it('handles message submission', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    
    fireEvent.change(textarea, { target: { value: 'Hello, world!' } });
    
    // Get button after typing (component expands on change)
    const sendButton = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendButton);
    
    // Allow additional evolving option keys (reasoning, imageOutput, etc.)
    expect(mockSendMessage).toHaveBeenCalledWith(
      'Hello, world!',
      expect.objectContaining({ webSearch: false })
    );
  });

  it('disables input when disabled prop is true', () => {
    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} disabled={true} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
