# State Management Migration to Zustand

## Current State Management Overview

### Existing State Patterns

The OpenRouter Chatbot currently uses several distinct state management patterns:

#### 1. **Custom Hooks with Local State**

- **`useChat`**: Manages chat messages, loading state, and errors using `useState`
- **`useModelData`**: Complex state with localStorage caching, background refresh, Web Workers
- **`useModelSelection`**: Model selection with persistence via `useLocalStorage`
- **`useLocalStorage`**: Generic localStorage persistence hook
- **`useDebounce`**: Simple debouncing for user input

#### 2. **Component-Level State**

- **`ChatInterface`**: Sidebar states, model selection UI state
- **`ChatSidebar`**: Chat history (currently static mock data)
- **`ModelDropdown`**: Search, filters, and dropdown UI state

#### 3. **Props Drilling**

- Model information flows down through multiple component layers
- Chat messages passed from `useChat` → `ChatInterface` → `MessageList`
- Model selection state flows between multiple components

### Data Flow Analysis

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   useChat       │    │ useModelData     │    │ useLocalStorage │
│ - messages[]    │    │ - models[]       │    │ - selectedModel │
│ - isLoading     │    │ - loading        │    │ - cached data   │
│ - error         │    │ - error          │    └─────────────────┘
│ - sendMessage   │    │ - isEnhanced     │
└─────────────────┘    │ - refresh        │
         │              │ - background     │
         │              │   workers        │
         │              └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                 ChatInterface                           │
│ - selectedDetailModel, isDetailsSidebarOpen            │
│ - isChatSidebarOpen, selectedTab                       │
│ - selectedGenerationId, hoveredGenerationId            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Child Components                           │
│ MessageList, MessageInput, ModelDropdown               │
│ ChatSidebar, ModelDetailsSidebar                       │
└─────────────────────────────────────────────────────────┘
```

## Problems & Limitations

### 1. **Performance Bottlenecks**

- **Excessive Re-renders**: `useChat` re-renders on every message append
- **Complex localStorage Operations**: Multiple hooks reading/writing localStorage independently
- **Background Refresh Complexity**: Web Worker management in `useModelData` is complex and error-prone
- **Prop Drilling**: State changes trigger re-renders down the component tree

### 2. **Architectural Issues**

- **State Fragmentation**: Related state scattered across multiple hooks
- **No Single Source of Truth**: Chat history exists in multiple places (ChatSidebar mock data vs useChat messages)
- **Coupling**: Components tightly coupled to specific hook implementations
- **Testing Complexity**: Mocking multiple hooks for testing is cumbersome

### 3. **SSR/Hydration Risks**

- **localStorage Mismatches**: `useLocalStorage` shows initial values on server, actual values on client
- **Race Conditions**: Background data fetching can cause hydration mismatches
- **Client-Only Features**: Web Workers and localStorage create client-server inconsistencies

### 4. **Circular Dependencies & State Conflicts**

- **Model Selection Loop**: `useModelSelection` depends on `useModelData`, but both manage model state
- **Chat History Duplication**: ChatSidebar maintains separate state from chat messages
- **Error State Conflicts**: Multiple error states across different hooks can contradict each other

## Zustand Migration Plan

### Store Architecture

We'll create specialized Zustand stores that eliminate these issues:

```typescript
// Store Structure
├── chatStore.ts        // Chat messages, conversations, history
├── modelStore.ts       // Models data, selection, background sync
├── uiStore.ts         // UI state, sidebars, modals
└── persistStore.ts    // Persistence configuration and utilities
```

### Store Responsibilities

#### **chatStore.ts**

- Manage all chat conversations
- Handle message CRUD operations
- Provide conversation switching
- Handle chat persistence with conversation history

#### **modelStore.ts**

- Fetch and cache model data
- Handle model selection
- Background refresh logic
- Enhanced vs basic model modes

#### **uiStore.ts**

- Sidebar states and navigation
- Modal and dropdown states
- Loading and error UI states
- Responsive layout state

### State Transition Strategy

#### **Phase 1: Foundation (Week 1)**

1. Install Zustand and persistence middleware
2. Create base store structure
3. Migrate `useLocalStorage` → Zustand persist
4. Create utility functions for SSR safety

#### **Phase 2: Core Chat (Week 2)**

1. Migrate `useChat` → `chatStore`
2. Update `ChatInterface` to use Zustand
3. Implement conversation management
4. Add chat history persistence

#### **Phase 3: Model Management (Week 3)**

1. Migrate `useModelData` + `useModelSelection` → `modelStore`
2. Simplify background refresh logic
3. Update `ModelDropdown` and related components
4. Remove duplicate model state

#### **Phase 4: UI & Polish (Week 4)**

1. Migrate remaining component state → `uiStore`
2. Remove prop drilling
3. Add optimistic updates
4. Performance optimization

### Side Effects Management

Zustand stores will handle side effects through:

1. **Actions**: Pure functions that update state
2. **Subscriptions**: External listeners for background tasks
3. **Middleware**: Logging, persistence, devtools

```typescript
// Example: Background model refresh
const useModelStore = create(
  subscribeWithSelector((set, get) => ({
    models: [],
    refreshModels: async () => {
      // Clean async logic here
    },
  }))
);

// Subscribe to changes for background refresh
useModelStore.subscribe(
  (state) => state.lastRefresh,
  (lastRefresh) => {
    // Schedule next refresh
  }
);
```

### Persistence Strategy

#### **Chat History Persistence**

```typescript
// Using zustand/middleware/persist
const chatStore = create(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      // ... chat actions
    }),
    {
      name: "openrouter-chat-storage",
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
      }),
    }
  )
);
```

#### **Model Data Caching**

```typescript
const modelStore = create(
  persist(
    (set, get) => ({
      models: [],
      cachedAt: null,
      // ... model actions
    }),
    {
      name: "openrouter-models-cache",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        models: state.models,
        cachedAt: state.cachedAt,
      }),
    }
  )
);
```

## Component Refactoring Strategy

### High Priority Refactors

#### **ChatInterface.tsx**

- **Current**: 15+ useState hooks, complex prop drilling
- **Target**: 3-4 Zustand store subscriptions, clean actions
- **Strategy**: Incremental migration, maintain existing API initially

#### **useChat.ts → chatStore.ts**

- **Current**: Complex useState with local message array
- **Target**: Zustand store with conversation management
- **Strategy**: Rewrite with backward-compatible hook wrapper

#### **useModelData.ts + useModelSelection.ts → modelStore.ts**

- **Current**: Two separate hooks with overlapping concerns
- **Target**: Single unified store with clear separation of concerns
- **Strategy**: Merge gradually, starting with data fetching

### Component Migration Phases

#### **Phase 1: Core Chat Components**

```typescript
// Before: Multiple useState hooks
const ChatInterface = () => {
  const { messages, sendMessage } = useChat();
  const { selectedModel } = useModelSelection();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // ... 12 more useState calls
};

// After: Clean Zustand subscriptions
const ChatInterface = () => {
  const { messages, sendMessage } = useChatStore();
  const { selectedModel } = useModelStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();
};
```

#### **Phase 2: Background Tasks**

```typescript
// Before: Complex useEffect chains in useModelData
useEffect(() => {
  // 50+ lines of background refresh logic
}, []);

// After: Clean Zustand actions
const modelStore = create((set, get) => ({
  startBackgroundRefresh: () => {
    // Simplified, testable logic
  },
}));
```

### Incremental Migration Strategy

1. **Parallel Implementation**: Create Zustand stores alongside existing hooks
2. **Component-by-Component**: Migrate one component at a time
3. **Feature Flags**: Use environment variables to enable/disable new stores
4. **A/B Testing**: Compare performance between old and new implementations
5. **Rollback Plan**: Keep old hooks until migration is 100% complete

## SSR & Persistence Considerations

### Server-Side Rendering Safety

#### **Hydration Mismatch Prevention**

```typescript
// SSR-safe store initialization
const createChatStore = () =>
  create(
    persist(
      (set, get) => ({
        conversations: [],
        isHydrated: false,
        // Only access localStorage after hydration
        _hasHydrated: () => set({ isHydrated: true }),
      }),
      {
        name: "chat-storage",
        onRehydrateStorage: () => (state) => {
          state?._hasHydrated();
        },
      }
    )
  );
```

#### **Client-Only Features**

```typescript
// Conditional background refresh
useEffect(() => {
  if (!chatStore.isHydrated || typeof window === "undefined") return;

  // Safe to start background tasks
  modelStore.getState().startBackgroundRefresh();
}, [chatStore.isHydrated]);
```

### Data Synchronization

#### **Cross-Tab Synchronization**

```typescript
// Broadcast channel for tab sync
const chatStore = create(
  persist(
    (set, get) => ({
      conversations: [],
      broadcastUpdate: (data) => {
        // Sync across tabs
        broadcastChannel.postMessage(data);
      },
    }),
    {
      name: "chat-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

#### **Offline/Online Handling**

```typescript
// Network-aware persistence
const modelStore = create((set, get) => ({
  isOnline: true,
  refreshModels: async () => {
    if (!get().isOnline) {
      // Use cached data
      return get().cachedModels;
    }
    // Fetch fresh data
  },
}));
```

## Sample Zustand Store Implementation

### chatStore.ts

```typescript
import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  subscribeWithSelector,
} from "zustand/middleware";
import { ChatMessage } from "../lib/types/chat";

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model?: string;
}

interface ChatState {
  // State
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;

  // Computed
  currentConversation: Conversation | null;
  currentMessages: ChatMessage[];

  // Actions
  createConversation: (title?: string) => string;
  switchConversation: (id: string) => void;
  sendMessage: (content: string, model?: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  clearCurrentMessages: () => void;
  retryLastMessage: () => Promise<void>;

  // Internal
  _hasHydrated: () => void;
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial state
        conversations: [],
        currentConversationId: null,
        isLoading: false,
        error: null,
        isHydrated: false,

        // Computed getters
        get currentConversation() {
          const { conversations, currentConversationId } = get();
          return (
            conversations.find((c) => c.id === currentConversationId) ?? null
          );
        },

        get currentMessages() {
          return get().currentConversation?.messages ?? [];
        },

        // Actions
        createConversation: (title = "New Chat") => {
          const id = `conv_${Date.now()}`;
          const newConversation: Conversation = {
            id,
            title,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          set((state) => ({
            conversations: [newConversation, ...state.conversations],
            currentConversationId: id,
          }));

          return id;
        },

        switchConversation: (id) => {
          set({ currentConversationId: id });
        },

        sendMessage: async (content, model) => {
          const { currentConversationId, conversations } = get();

          if (!currentConversationId) {
            // Create new conversation if none exists
            get().createConversation();
          }

          const userMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            content: content.trim(),
            role: "user",
            timestamp: new Date(),
          };

          // Add user message optimistically
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === currentConversationId
                ? {
                    ...conv,
                    messages: [...conv.messages, userMessage],
                    updatedAt: new Date(),
                  }
                : conv
            ),
            isLoading: true,
            error: null,
          }));

          try {
            // API call
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: content, model }),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            const assistantMessage: ChatMessage = {
              id: `msg_${Date.now() + 1}`,
              content: data.response,
              role: "assistant",
              timestamp: new Date(),
              model: data.model || model,
              total_tokens: data.usage?.total_tokens,
              elapsed_time: data.elapsed_time,
              completion_id: data.id,
            };

            // Add assistant response
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === currentConversationId
                  ? {
                      ...conv,
                      messages: [...conv.messages, assistantMessage],
                      updatedAt: new Date(),
                    }
                  : conv
              ),
              isLoading: false,
            }));
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            // Mark user message as failed
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === currentConversationId
                  ? {
                      ...conv,
                      messages: conv.messages.map((msg) =>
                        msg.id === userMessage.id
                          ? { ...msg, error: true }
                          : msg
                      ),
                    }
                  : conv
              ),
              isLoading: false,
              error: errorMessage,
            }));
          }
        },

        updateConversationTitle: (id, title) => {
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === id ? { ...conv, title, updatedAt: new Date() } : conv
            ),
          }));
        },

        deleteConversation: (id) => {
          set((state) => {
            const newConversations = state.conversations.filter(
              (c) => c.id !== id
            );
            const newCurrentId =
              state.currentConversationId === id
                ? newConversations[0]?.id ?? null
                : state.currentConversationId;

            return {
              conversations: newConversations,
              currentConversationId: newCurrentId,
            };
          });
        },

        clearCurrentMessages: () => {
          const { currentConversationId } = get();
          if (!currentConversationId) return;

          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === currentConversationId
                ? { ...conv, messages: [], updatedAt: new Date() }
                : conv
            ),
          }));
        },

        retryLastMessage: async () => {
          const { currentMessages } = get();
          const lastUserMessage = currentMessages
            .slice()
            .reverse()
            .find((msg) => msg.role === "user");

          if (lastUserMessage) {
            await get().sendMessage(lastUserMessage.content);
          }
        },

        _hasHydrated: () => {
          set({ isHydrated: true });
        },
      }),
      {
        name: "openrouter-chat-storage",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          conversations: state.conversations,
          currentConversationId: state.currentConversationId,
        }),
        onRehydrateStorage: () => (state) => {
          state?._hasHydrated();
        },
      }
    )
  )
);

// Backward compatibility hook
export const useChat = () => {
  const store = useChatStore();

  return {
    messages: store.currentMessages,
    isLoading: store.isLoading,
    error: store.error ? { message: store.error } : null,
    sendMessage: store.sendMessage,
    clearMessages: store.clearCurrentMessages,
    clearError: () => useChatStore.setState({ error: null }),
    clearMessageError: (messageId: string) => {
      // Implementation for backward compatibility
    },
  };
};
```

## Notes & Best Practices

### Store Organization

- **Single Responsibility**: Each store manages one domain
- **Flat State**: Avoid deep nesting, prefer normalized data
- **Computed Properties**: Use getters for derived state
- **Action Naming**: Use verb-noun pattern (`createConversation`, `updateTitle`)

### Performance Optimization

- **Selective Subscriptions**: Use `subscribeWithSelector` for targeted updates
- **Memoization**: Memoize expensive computed values
- **Batch Updates**: Group related state changes
- **Lazy Loading**: Initialize expensive state only when needed

### Testing Strategy

- **Store Testing**: Test actions and state transitions independently
- **Component Testing**: Mock store state for component tests
- **Integration Testing**: Test store interactions
- **Persistence Testing**: Test hydration and data persistence

### Error Handling

- **Graceful Degradation**: Provide fallbacks for failed operations
- **Error Boundaries**: Catch and display store errors
- **Retry Logic**: Implement exponential backoff for API calls
- **State Recovery**: Provide ways to recover from corrupted state

### Development Experience

- **DevTools**: Use Zustand devtools for debugging
- **Type Safety**: Leverage TypeScript for store contracts
- **Hot Reload**: Ensure stores work with development hot reload
- **Documentation**: Document store APIs and usage patterns

This migration plan provides a solid foundation for moving from the current fragmented state management to a clean, scalable Zustand architecture that eliminates the existing performance and architectural issues while providing better developer experience and maintainability.
