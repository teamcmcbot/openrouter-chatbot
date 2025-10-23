import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatSidebar } from '../../components/ui/ChatSidebar';
import { useChatStore } from '../../stores';
import { useAuthStore } from '../../stores/useAuthStore';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useAuth hook
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    session: null,
  }),
}));

// Mock stores with search functionality
jest.mock('../../stores', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: jest.fn(),
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    error: null,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    initialize: jest.fn(),
    clearError: jest.fn(),
  }),
}));

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('ChatSidebar Search', () => {
  const mockConversations = [
    {
      id: 'conv1',
      title: 'Bug fix in login',
      messages: [
        { id: 'msg1', content: 'How do I fix the login bug?', role: 'user', timestamp: new Date() },
        { id: 'msg2', content: 'Here is how to fix it...', role: 'assistant', timestamp: new Date() },
      ],
      userId: 'user1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 2,
      totalTokens: 100,
      isActive: false,
      lastMessagePreview: 'Here is how to fix it...',
      lastMessageTimestamp: new Date().toISOString(),
    },
    {
      id: 'conv2',
      title: 'What is BYND?',
      messages: [],
      userId: 'user1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      isActive: false,
      lastMessagePreview: 'BYND (NASDAQ: BYND) is a publicly...',
      lastMessageTimestamp: new Date().toISOString(),
    },
    {
      id: 'conv3',
      title: 'Recipe for pasta',
      messages: [],
      userId: 'user1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      isActive: false,
      lastMessagePreview: 'Here is a great pasta recipe...',
      lastMessageTimestamp: new Date().toISOString(),
    },
  ];

  const defaultMockStore = {
    conversations: mockConversations,
    currentConversationId: null,
    switchConversation: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    loadMoreConversations: jest.fn(),
    clearAllConversations: jest.fn(),
    isHydrated: true,
    searchQuery: '',
    searchMode: 'inactive',
    searchResults: [],
    performLocalSearch: jest.fn(),
    clearSearch: jest.fn(),
    sidebarPaging: null,
    isSyncing: false,
    lastSyncTime: null,
    syncError: null,
  };

  const defaultAuthStore = {
    isAuthenticated: false,
    user: null,
  };

  beforeEach(() => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(defaultMockStore);
      }
      return defaultMockStore;
    });

    (useAuthStore as unknown as jest.Mock).mockReturnValue(defaultAuthStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders search input', () => {
    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    const searchInput = screen.getByPlaceholderText('Search conversations...');
    expect(searchInput).toBeInTheDocument();
  });

  it('shows search icon', () => {
    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    // Search icon is present (SVG rendered)
    const searchInput = screen.getByPlaceholderText('Search conversations...');
    expect(searchInput.parentElement).toHaveClass('relative');
  });

  it('does not show clear button when search is empty', () => {
    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    const clearButton = screen.queryByLabelText('Clear search');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('shows clear button when search has text', () => {
    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    const searchInput = screen.getByPlaceholderText('Search conversations...');
    fireEvent.change(searchInput, { target: { value: 'bug' } });
    
    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeInTheDocument();
  });

  it('calls performLocalSearch with debounce when typing', async () => {
    const mockPerformLocalSearch = jest.fn();
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = { ...defaultMockStore, performLocalSearch: mockPerformLocalSearch };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    const searchInput = screen.getByPlaceholderText('Search conversations...');
    fireEvent.change(searchInput, { target: { value: 'bug' } });
    
    // Should not call immediately (debounced)
    expect(mockPerformLocalSearch).not.toHaveBeenCalled();
    
    // Wait for debounce (300ms)
    await waitFor(() => {
      expect(mockPerformLocalSearch).toHaveBeenCalledWith('bug');
    }, { timeout: 500 });
  });

  it('calls clearSearch when clear button is clicked', async () => {
    const mockClearSearch = jest.fn();
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = { ...defaultMockStore, clearSearch: mockClearSearch };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    const searchInput = screen.getByPlaceholderText('Search conversations...');
    fireEvent.change(searchInput, { target: { value: 'bug' } });
    
    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);
    
    expect(mockClearSearch).toHaveBeenCalled();
  });

  it('displays search results banner when search is active', () => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = {
        ...defaultMockStore,
        searchQuery: 'bug',
        searchMode: 'local',
        searchResults: [mockConversations[0]],
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    expect(screen.getByText(/Found 1 conversation matching "bug"/)).toBeInTheDocument();
  });

  it('displays no results message when search returns empty', () => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = {
        ...defaultMockStore,
        searchQuery: 'nonexistent',
        searchMode: 'local',
        searchResults: [],
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    expect(screen.getByText(/No conversations found for "nonexistent"/)).toBeInTheDocument();
  });

  it('shows search results instead of all conversations when searching', () => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = {
        ...defaultMockStore,
        searchQuery: 'bug',
        searchMode: 'local',
        searchResults: [mockConversations[0]], // Only first conversation
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    // Should show only the search result
    expect(screen.getByText('Bug fix in login')).toBeInTheDocument();
    
    // Should NOT show other conversations
    expect(screen.queryByText('Recipe for pasta')).not.toBeInTheDocument();
  });

  it('hides load more button during search', () => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = {
        ...defaultMockStore,
        searchQuery: 'bug',
        searchMode: 'local',
        searchResults: [mockConversations[0]],
        sidebarPaging: { hasMore: true, loading: false, pageSize: 20, nextCursor: null, initialized: true },
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user1' },
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    // Load more button should not be visible during search
    expect(screen.queryByText('Load more…')).not.toBeInTheDocument();
  });

  it('updates footer count to show search results count', () => {
    (useChatStore as unknown as jest.Mock).mockImplementation((selector) => {
      const store = {
        ...defaultMockStore,
        searchQuery: 'bug',
        searchMode: 'local',
        searchResults: [mockConversations[0]],
      };
      if (typeof selector === 'function') {
        return selector(store);
      }
      return store;
    });

    render(<ChatSidebar isOpen={true} onClose={jest.fn()} onNewChat={jest.fn()} />);
    
    // Footer should show filtered count
    expect(screen.getByText('1 of 3 conversations')).toBeInTheDocument();
  });
});
