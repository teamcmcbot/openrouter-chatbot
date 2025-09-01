import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock toast to capture default invocation and helpers
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
import toast from 'react-hot-toast';
const toastMock = toast as unknown as jest.Mock;

// Minimal stores mock
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
      deleteConversation: jest.fn(),
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

import { ChatSidebar } from '../../components/ui/ChatSidebar';

// Helper to simulate hover capability (desktop vs touch)
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

describe('ChatSidebar mobile hint gating', () => {
  beforeEach(() => {
    // Clean slate for localStorage and mocks
    localStorage.clear();
  toastMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not show hint on desktop or when sidebar is closed', async () => {
    setHoverCapability(true); // desktop

    await act(async () => {
      render(<ChatSidebar isOpen onClose={() => {}} onNewChat={() => {}} />);
      await Promise.resolve();
    });
    expect(toast).not.toHaveBeenCalled();

  toastMock.mockClear();
    setHoverCapability(false); // touch
    await act(async () => {
      render(<ChatSidebar isOpen={false} onClose={() => {}} onNewChat={() => {}} />);
      await Promise.resolve();
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows hint once on mobile when sidebar opens, then never again', async () => {
    setHoverCapability(false); // touch device

    // First open should show the tip
    await act(async () => {
      render(<ChatSidebar isOpen onClose={() => {}} onNewChat={() => {}} />);
      await Promise.resolve();
    });
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toastMock.mock.calls[0][0]).toMatch(/Long‑press a chat to delete or edit\./i);

    // Re-mount should not show again due to localStorage key
  toastMock.mockClear();
    await act(async () => {
      render(<ChatSidebar isOpen onClose={() => {}} onNewChat={() => {}} />);
      await Promise.resolve();
    });
    expect(toast).not.toHaveBeenCalled();
  });
});
