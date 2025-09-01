import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocks
jest.mock('react-hot-toast', () => {
  type ToastFn = ((...args: unknown[]) => unknown) & {
    dismiss: jest.Mock;
    success: jest.Mock;
  };
  const toastFn = jest.fn() as unknown as ToastFn;
  toastFn.dismiss = jest.fn();
  toastFn.success = jest.fn();
  return { __esModule: true, default: toastFn };
});

jest.mock('../../stores', () => {
  const actual = jest.requireActual('../../stores');
  const conversations = [
    { id: 'c1', title: 'Hello', messages: [], messageCount: 0, totalTokens: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01', isActive: false },
  ];
  return {
    ...actual,
    useAuthStore: () => ({ isAuthenticated: false }),
    useChatStore: () => ({
      conversations,
      currentConversationId: null,
      isHydrated: true,
      switchConversation: jest.fn(),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
      updateConversationTitle: jest.fn(),
      clearAllConversations: jest.fn(),
      loadMoreConversations: jest.fn(),
      isSyncing: false,
      lastSyncTime: null,
      syncError: null,
      sidebarPaging: { hasMore: false, loading: false, pageSize: 20, initialized: true, nextCursor: null },
    }),
  };
});

// Under test
import { ChatSidebar } from '../../components/ui/ChatSidebar';

// Helper to simulate non-hover (touch) device
const setHoverCapability = (hasHover: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('(hover: hover)') ? hasHover : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
};

describe('ChatSidebar long-press (mobile)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setHoverCapability(false); // touch device
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('opens action sheet on long-press and shows actions', () => {
    render(<ChatSidebar isOpen onClose={() => {}} onNewChat={() => {}} />);

    const row = screen.getByText('Hello').closest('div');
    expect(row).toBeInTheDocument();

    // Start long press
    act(() => {
      fireEvent.pointerDown(row!, { clientX: 10, clientY: 10 });
      jest.advanceTimersByTime(500);
    });

  // Sheet appears
  const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /delete conversation/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /edit title/i })
    ).toBeInTheDocument();

    // Trigger delete (handler is mocked)
  fireEvent.click(within(dialog).getByRole('button', { name: /delete conversation/i }));
  });
});
