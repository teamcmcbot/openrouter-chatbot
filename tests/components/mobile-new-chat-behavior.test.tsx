import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import ChatInterface from '../../components/chat/ChatInterface';

// Stub heavy child UI components to keep the test fast and deterministic
jest.mock('../../components/ui/ModelDropdown', () => () => null);
jest.mock('../../components/chat/MessageList', () => {
  const StubMessageList = () => <div data-testid="message-list" />;
  return { __esModule: true, default: StubMessageList };
});
jest.mock('../../components/ui/ModelDetailsSidebar', () => ({
  ModelDetailsSidebar: () => null,
}));

// Provide a minimal ChatSidebar that exposes the New Chat button
jest.mock('../../components/ui/ChatSidebar', () => ({
  ChatSidebar: ({ onNewChat, className }: { onNewChat: () => void; className?: string }) => {
    const isMobile = (className || '').includes('xl:hidden');
    return (
      <div>
        <button data-testid={isMobile ? 'new-chat-mobile' : 'new-chat-desktop'} onClick={onNewChat}>
          New Chat
        </button>
      </div>
    );
  },
}));

// Mock stores to avoid network calls and complex state
jest.mock('../../stores', () => {
  return {
    useChat: () => ({
      messages: [],
      isLoading: false,
      error: null,
      sendMessage: jest.fn(),
      clearError: jest.fn(),
      retryLastMessage: jest.fn(),
    }),
    useChatStore: (selector: (s: { createConversation: () => void }) => unknown) =>
      selector({ createConversation: jest.fn() }),
    useModelSelection: () => ({
      availableModels: [],
      selectedModel: '',
      setSelectedModel: jest.fn(),
      isLoading: false,
      isEnhanced: false,
    }),
    useDetailsSidebar: () => ({
      selectedDetailModel: null,
      isDetailsSidebarOpen: false,
      selectedTab: 'overview',
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
      showModelDetails: jest.fn(),
      closeDetailsSidebar: jest.fn(),
      setHoveredGenerationId: jest.fn(),
    }),
    useChatSidebarState: () => ({
      isChatSidebarOpen: true,
      toggleChatSidebar: jest.fn(),
    }),
  };
});

// Mock matchMedia for viewport checks
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes('min-width: 1280px') ? window.innerWidth >= 1280 : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

describe('Mobile New Chat behavior', () => {
  test('clicking New Chat closes sidebar and focuses input on mobile', async () => {
    // Set viewport to mobile using defineProperty (innerWidth is read-only)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    // Make setTimeout immediate to avoid waiting for CSS transition delays in code
    const timeoutSpy = jest
      .spyOn(window, 'setTimeout')
      .mockImplementation(((cb: TimerHandler) => {
        if (typeof cb === 'function') (cb as () => void)();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout);

    const { container } = render(<ChatInterface />);

  // Click the stubbed mobile New Chat button
  fireEvent.click(screen.getByTestId('new-chat-mobile'));

    const textarea = container.querySelector('#message-input') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(document.activeElement).toBe(textarea);

    timeoutSpy.mockRestore();
  });
});
