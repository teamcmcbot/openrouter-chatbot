import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageInput from '../../../components/chat/MessageInput';
import toast from 'react-hot-toast';

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock stores and hooks
const mockUseAuth = jest.fn();
jest.mock('../../../stores/useAuthStore', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseModelSelection = jest.fn();
jest.mock('../../../stores/useModelStore', () => ({
  useModelSelection: () => mockUseModelSelection(),
}));

jest.mock('../../../stores/useSettingsStore', () => ({
  useSettingsStore: () => ({
    getSetting: () => false,
    setSetting: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useUserData', () => ({
  useUserData: () => ({
    data: null,
    loading: false,
    error: null,
  }),
}));

jest.mock('../../../hooks/useBanStatus', () => ({
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

describe('MessageInput - Image Generation Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default auth state
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      isLoading: false,
      isEnterprise: true,
    });
  });

  it('shows "Describe your image..." placeholder when image generation model is selected', () => {
    // Mock model selection with image generation model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'openai/dall-e-3',
      availableModels: [
        {
          id: 'openai/dall-e-3',
          name: 'DALL-E 3',
          output_modalities: ['image'],
          input_modalities: ['text'],
        },
      ],
    });

    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/describe your image/i);
    expect(textarea).toBeInTheDocument();
  });

  it('shows "Type your message..." placeholder when text-only model is selected', () => {
    // Mock model selection with text-only model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'openai/gpt-4',
      availableModels: [
        {
          id: 'openai/gpt-4',
          name: 'GPT-4',
          output_modalities: ['text'],
          input_modalities: ['text'],
        },
      ],
    });

    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/type your message/i);
    expect(textarea).toBeInTheDocument();
  });

  it('shows toast notification when switching to image generation model', async () => {
    // Start with text-only model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'openai/gpt-4',
      availableModels: [
        {
          id: 'openai/gpt-4',
          name: 'GPT-4',
          output_modalities: ['text'],
          input_modalities: ['text'],
        },
      ],
    });

    const mockSendMessage = jest.fn();
    const { rerender } = render(<MessageInput onSendMessage={mockSendMessage} />);
    
    expect(toast.success).not.toHaveBeenCalled();

    // Switch to image generation model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'openai/dall-e-3',
      availableModels: [
        {
          id: 'openai/dall-e-3',
          name: 'DALL-E 3',
          output_modalities: ['image'],
          input_modalities: ['text'],
        },
      ],
    });

    rerender(<MessageInput onSendMessage={mockSendMessage} />);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'DALL-E 3 can generate images',
        { id: 'image-gen-model-selected' }
      );
    });
  });

  it('does not show toast when switching between two image generation models', async () => {
    // Start with first image generation model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'openai/dall-e-3',
      availableModels: [
        {
          id: 'openai/dall-e-3',
          name: 'DALL-E 3',
          output_modalities: ['image'],
          input_modalities: ['text'],
        },
      ],
    });

    const mockSendMessage = jest.fn();
    const { rerender } = render(<MessageInput onSendMessage={mockSendMessage} />);
    
    // Clear any initial toast calls
    jest.clearAllMocks();

    // Switch to another image generation model
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'google/gemini-2.5-flash-image-preview',
      availableModels: [
        {
          id: 'google/gemini-2.5-flash-image-preview',
          name: 'Gemini 2.5 Flash Image',
          output_modalities: ['image', 'text'],
          input_modalities: ['text'],
        },
      ],
    });

    rerender(<MessageInput onSendMessage={mockSendMessage} />);

    // Should not show toast since both models support image generation
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows "Describe your image..." for multimodal models with image output', () => {
    // Mock multimodal model (text + image output)
    mockUseModelSelection.mockReturnValue({
      selectedModel: 'google/gemini-2.5-flash-image-preview',
      availableModels: [
        {
          id: 'google/gemini-2.5-flash-image-preview',
          name: 'Gemini 2.5 Flash Image',
          output_modalities: ['text', 'image'],
          input_modalities: ['text', 'image'],
        },
      ],
    });

    const mockSendMessage = jest.fn();
    render(<MessageInput onSendMessage={mockSendMessage} />);
    
    const textarea = screen.getByPlaceholderText(/describe your image/i);
    expect(textarea).toBeInTheDocument();
  });
});
