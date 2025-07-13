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
         │             │ - background     │
         │             │   workers        │
         │             └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                 ChatInterface                           │
│ - selectedDetailModel, isDetailsSidebarOpen             │
│ - isChatSidebarOpen, selectedTab                        │
│ - selectedGenerationId, hoveredGenerationId             │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Child Components                           │
│ MessageList, MessageInput, ModelDropdown                │
│ ChatSidebar, ModelDetailsSidebar                        │
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
├── useChatStore.ts     // Chat messages, conversations, history
├── useModelStore.ts    // Models data, selection, background sync
├── useUIStore.ts       // UI state, sidebars, modals
├── chatTypes.ts        // Chat-related TypeScript interfaces
├── storeUtils.ts       // Persistence configuration and utilities
└── constants.ts        // Storage keys and configuration constants
```

### Store Responsibilities

#### **useChatStore.ts**

- Manage all chat conversations
- Handle message CRUD operations
- Provide conversation switching
- Handle chat persistence with conversation history

#### **useModelStore.ts**

- Fetch and cache model data
- Handle model selection
- Background refresh logic
- Enhanced vs basic model modes

#### **useUIStore.ts**

- Sidebar states and navigation
- Modal and dropdown states
- Loading and error UI states
- Responsive layout state

### State Transition Strategy

#### **Phase 1: Foundation (Week 1)**

**Goal**: Set up Zustand infrastructure and create foundational stores

**Tasks & Checklist:**

1. **Install Dependencies & Setup**

   - [ ] Install `zustand` package: `npm install zustand`
   - [ ] Install persistence middleware (included with zustand)
   - [ ] Install devtools integration: `npm install -D @redux-devtools/extension`
   - [ ] Update TypeScript config if needed for strict mode
   - [ ] Create `stores/` directory structure

2. **Create Base Store Structure**

   - [ ] Create `lib/constants.ts` with storage keys and cache config
   - [ ] Create `stores/storeUtils.ts` with SSR-safe utilities
   - [ ] Set up `stores/index.ts` for centralized exports
   - [ ] Create type definitions in `stores/types/` directory
   - [ ] Add ESLint rules for Zustand best practices

3. **Migrate useLocalStorage → Zustand Persist**

   - [ ] Create `stores/useSettingsStore.ts` to replace `useLocalStorage`
   - [ ] Add SSR-safe hydration handling
   - [ ] Implement backward-compatible `useLocalStorage` wrapper
   - [ ] Test persistence across page refreshes
   - [ ] Add error handling for localStorage failures

4. **SSR Safety Utilities**
   - [ ] Create `isServer()` utility function
   - [ ] Add `useIsomorphicLayoutEffect` hook
   - [ ] Implement hydration-safe store initialization
   - [ ] Add client-only feature detection
   - [ ] Test SSR compatibility with Next.js

**Validation Criteria:**

- [ ] All existing `useLocalStorage` calls work without changes
- [ ] No hydration mismatches in development
- [ ] Stores persist correctly across browser sessions
- [ ] DevTools integration working in development

---

#### **Phase 2: Core Chat (Week 2)**

**Goal**: Migrate chat functionality to Zustand with conversation management

**Tasks & Checklist:**

1. **Create Chat Store Foundation**

   - [ ] Create `stores/chatTypes.ts` with all interfaces
   - [ ] Create `stores/chatSelectors.ts` with computed state
   - [ ] Implement base `stores/useChatStore.ts` structure
   - [ ] Add conversation CRUD operations
   - [ ] Set up persistence with proper partitioning

2. **Migrate useChat Hook**

   - [ ] Implement `useChatStore` with all `useChat` functionality
   - [ ] Create backward-compatible `useChat` wrapper
   - [ ] Add optimistic message updates
   - [ ] Implement error handling and retry logic
   - [ ] Test message sending and receiving

3. **Update ChatInterface Component**

   - [ ] Replace `useChat` calls with `useChatStore` selectors
   - [ ] Remove local state management for messages
   - [ ] Add conversation switching UI logic
   - [ ] Implement conversation creation/deletion
   - [ ] Test component re-render optimization

4. **Implement Conversation Management**

   - [ ] Add conversation title editing functionality
   - [ ] Implement conversation deletion with confirmation
   - [ ] Add conversation search/filtering
   - [ ] Create conversation export/import functionality
   - [ ] Add conversation metadata tracking

5. **Chat History Persistence**
   - [ ] Set up localStorage persistence for conversations
   - [ ] Implement cache versioning and migration
   - [ ] Add data validation and recovery
   - [ ] Test persistence across different scenarios
   - [ ] Add conversation backup/restore features

**Validation Criteria:**

- [ ] All existing chat functionality works without changes
- [ ] Conversations persist across browser sessions
- [ ] Multiple conversations can be managed simultaneously
- [ ] No performance regressions in message rendering
- [ ] Error states are handled gracefully

---

#### **Phase 3: Model Management (Week 3)**

**Goal**: Unify model data and selection into a single, efficient store

**Tasks & Checklist:**

1. **Create Model Store Foundation**

   - [ ] Create `stores/modelTypes.ts` with model interfaces
   - [ ] Create `stores/modelSelectors.ts` for computed state
   - [ ] Implement base `stores/useModelStore.ts` structure
   - [ ] Set up model caching with TTL
   - [ ] Add enhanced vs basic model mode handling

2. **Migrate useModelData Logic**

   - [ ] Port model fetching logic to store actions
   - [ ] Simplify background refresh implementation
   - [ ] Remove Web Worker complexity (use simpler intervals)
   - [ ] Add network-aware caching
   - [ ] Implement cache invalidation strategies

3. **Migrate useModelSelection Logic**

   - [ ] Port model selection to store state
   - [ ] Add model validation and fallback logic
   - [ ] Implement model preference persistence
   - [ ] Create model filtering and search
   - [ ] Add model comparison features

4. **Update Components**

   - [ ] Update `ModelDropdown` to use `useModelStore`
   - [ ] Update `ChatInterface` model selection logic
   - [ ] Update `ModelDetailsSidebar` with store data
   - [ ] Remove old hook dependencies
   - [ ] Test all model-related UI interactions

5. **Background Sync Optimization**
   - [ ] Implement efficient background model refresh
   - [ ] Add offline/online detection
   - [ ] Set up cross-tab synchronization
   - [ ] Add model update notifications
   - [ ] Test background sync performance

**Validation Criteria:**

- [ ] Model loading is faster and more reliable
- [ ] Background refresh works without blocking UI
- [ ] Model selection persists correctly
- [ ] Enhanced/basic mode switching works seamlessly
- [ ] No duplicate API calls for model data

---

#### **Phase 4: UI & Polish (Week 4)**

**Goal**: Complete migration and optimize performance

**Tasks & Checklist:**

1. **Create UI Store**

   - [ ] Create `stores/useUIStore.ts` for all UI state
   - [ ] Migrate sidebar states from components
   - [ ] Add modal and dropdown state management
   - [ ] Implement responsive layout state
   - [ ] Add theme and preference management

2. **Remove Prop Drilling**

   - [ ] Audit all components for unnecessary prop passing
   - [ ] Replace prop chains with direct store subscriptions
   - [ ] Update component interfaces to remove unused props
   - [ ] Simplify component composition
   - [ ] Test component isolation and reusability

3. **Add Optimistic Updates**

   - [ ] Implement optimistic UI for message sending
   - [ ] Add optimistic updates for conversation operations
   - [ ] Create loading states for async operations
   - [ ] Add rollback mechanisms for failed operations
   - [ ] Test optimistic update scenarios

4. **Performance Optimization**

   - [ ] Add selective subscriptions with `subscribeWithSelector`
   - [ ] Implement proper memoization for selectors
   - [ ] Optimize re-render patterns
   - [ ] Add performance monitoring
   - [ ] Profile and fix any performance bottlenecks

5. **Testing & Documentation**

   - [ ] Write comprehensive store tests
   - [ ] Add integration tests for store interactions
   - [ ] Update component tests to use store mocks
   - [ ] Create migration documentation
   - [ ] Add troubleshooting guide

6. **Cleanup & Finalization**
   - [ ] Remove all old hooks (`useChat`, `useModelData`, etc.)
   - [ ] Clean up unused utilities and types
   - [ ] Update all import statements
   - [ ] Remove feature flags and compatibility layers
   - [ ] Final performance audit and optimization

**Validation Criteria:**

- [ ] All components use Zustand stores exclusively
- [ ] No prop drilling in the component tree
- [ ] Performance is equal or better than before migration
- [ ] All tests pass with new store architecture
- [ ] Documentation is complete and accurate

---

### Migration Rollback Plan

If any phase encounters critical issues:

1. **Immediate Rollback Steps**

   - [ ] Revert to previous Git commit
   - [ ] Re-enable feature flags for old hooks
   - [ ] Restore original component implementations
   - [ ] Verify all functionality works as before

2. **Issue Analysis**

   - [ ] Document specific failure points
   - [ ] Identify root cause of issues
   - [ ] Plan fixes for next iteration
   - [ ] Update migration strategy if needed

3. **Gradual Re-implementation**
   - [ ] Fix identified issues in isolation
   - [ ] Test fixes thoroughly before re-migration
   - [ ] Consider smaller migration increments
   - [ ] Update validation criteria based on learnings

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

#### **Constants and Configuration**

```typescript
// lib/constants.ts
export const STORAGE_KEYS = {
  CHAT: "openrouter-chat-storage",
  MODELS: "openrouter-models-cache",
  UI_PREFERENCES: "openrouter-ui-preferences",
} as const;

export const CACHE_CONFIG = {
  MODEL_TTL_HOURS: 24,
  BACKGROUND_REFRESH_INTERVAL: 60 * 60 * 1000, // 1 hour
  CACHE_VERSION: 1,
} as const;
```

#### **Chat History Persistence**

```typescript
// Using zustand/middleware/persist with constants
import { STORAGE_KEYS } from "../lib/constants";

const chatStore = create(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      // ... chat actions
    }),
    {
      name: STORAGE_KEYS.CHAT,
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
import { STORAGE_KEYS } from "../lib/constants";

const modelStore = create(
  persist(
    (set, get) => ({
      models: [],
      cachedAt: null,
      // ... model actions
    }),
    {
      name: STORAGE_KEYS.MODELS,
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

#### **useChat.ts → useChatStore.ts**

- **Current**: Complex useState with local message array
- **Target**: Zustand store with conversation management
- **Strategy**: Rewrite with backward-compatible hook wrapper

#### **useModelData.ts + useModelSelection.ts → useModelStore.ts**

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

### File Structure

```
stores/
├── useChatStore.ts       // Main chat store
├── chatTypes.ts          // Chat-related types
├── chatSelectors.ts      // Selector functions for computed state
└── chatActions.ts        // Complex action implementations (future)
```

### chatTypes.ts

```typescript
import { ChatMessage } from "../lib/types/chat";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model?: string;
}

export interface ChatState {
  // State
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;

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
```

### chatSelectors.ts

```typescript
import { ChatState } from "./chatTypes";

// Computed state selectors (better than getters in store)
export const getCurrentConversation = (state: ChatState) =>
  state.conversations.find((c) => c.id === state.currentConversationId) ?? null;

export const getCurrentMessages = (state: ChatState) =>
  getCurrentConversation(state)?.messages ?? [];

export const getConversationById = (state: ChatState, id: string) =>
  state.conversations.find((c) => c.id === id);

// Convenience hooks using selectors
export const useCurrentConversation = () =>
  useChatStore(getCurrentConversation);

export const useCurrentMessages = () => useChatStore(getCurrentMessages);
```

### useChatStore.ts

```typescript
import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  subscribeWithSelector,
  devtools,
} from "zustand/middleware";
import { ChatMessage } from "../lib/types/chat";
import { ChatState, Conversation } from "./chatTypes";
import { STORAGE_KEYS } from "../lib/constants";

export const useChatStore = create<ChatState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          conversations: [],
          currentConversationId: null,
          isLoading: false,
          error: null,
          isHydrated: false,

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
            const { currentConversationId } = get();

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
                conv.id === state.currentConversationId
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
                  conv.id === state.currentConversationId
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
                  conv.id === state.currentConversationId
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
                conv.id === id
                  ? { ...conv, title, updatedAt: new Date() }
                  : conv
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
            const currentConversation = get().conversations.find(
              (c) => c.id === get().currentConversationId
            );

            if (!currentConversation) return;

            const lastUserMessage = currentConversation.messages
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
          name: STORAGE_KEYS.CHAT,
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
    ),
    {
      name: "chat-store", // DevTools name
    }
  )
);

// Backward compatibility hook
export const useChat = () => {
  const isLoading = useChatStore((state) => state.isLoading);
  const error = useChatStore((state) => state.error);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const clearCurrentMessages = useChatStore(
    (state) => state.clearCurrentMessages
  );

  // Use selector for current messages
  const messages = useChatStore((state) => {
    const currentConv = state.conversations.find(
      (c) => c.id === state.currentConversationId
    );
    return currentConv?.messages ?? [];
  });

  return {
    messages,
    isLoading,
    error: error ? { message: error } : null,
    sendMessage,
    clearMessages: clearCurrentMessages,
    clearError: () => useChatStore.setState({ error: null }),
    clearMessageError: (messageId: string) => {
      // Implementation for backward compatibility
      const { currentConversationId, conversations } = useChatStore.getState();
      useChatStore.setState({
        conversations: conversations.map((conv) =>
          conv.id === currentConversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, error: false } : msg
                ),
              }
            : conv
        ),
      });
    },
  };
};
```

## Notes & Best Practices

### Store Organization

- **Single Responsibility**: Each store manages one domain
- **Flat State**: Avoid deep nesting, prefer normalized data
- **Computed Properties**: Use selector functions instead of getters in store
- **Action Naming**: Use verb-noun pattern (`createConversation`, `updateTitle`)

### Middleware Options

As the application grows, consider adding these Zustand middlewares:

```typescript
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// For development debugging
const useStoreWithDevtools = create(
  devtools(
    (set, get) => ({
      /* store */
    }),
    { name: "store-name" }
  )
);

// For immutable updates (optional)
const useStoreWithImmer = create(
  immer((set, get) => ({
    updateNested: (id: string, value: any) =>
      set((state) => {
        const item = state.items.find((i) => i.id === id);
        if (item) item.value = value;
      }),
  }))
);
```

Available middleware:

- `devtools()` - Redux DevTools integration
- `immer()` - Immutable state updates
- `subscribeWithSelector()` - Selective subscriptions
- `persist()` - LocalStorage/SessionStorage persistence

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

#### **Example Store Tests**

```typescript
// tests/stores/useChatStore.test.ts
import { useChatStore } from "@/stores/useChatStore";

describe("useChatStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      error: null,
      isHydrated: true,
    });
  });

  it("creates a new conversation", () => {
    const store = useChatStore.getState();
    const id = store.createConversation("Test Chat");

    const state = useChatStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0].title).toBe("Test Chat");
    expect(state.currentConversationId).toBe(id);
  });

  it("switches between conversations", () => {
    const store = useChatStore.getState();
    const id1 = store.createConversation("Chat 1");
    const id2 = store.createConversation("Chat 2");

    store.switchConversation(id1);
    expect(useChatStore.getState().currentConversationId).toBe(id1);
  });

  it("handles message sending errors gracefully", async () => {
    // Mock fetch to simulate error
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const store = useChatStore.getState();
    store.createConversation();

    await store.sendMessage("test message");

    const state = useChatStore.getState();
    expect(state.error).toBe("Network error");
    expect(state.isLoading).toBe(false);
  });
});
```

#### **Component Testing with Store**

```typescript
// tests/components/ChatInterface.test.tsx
import { render, screen } from "@testing-library/react";
import { useChatStore } from "@/stores/useChatStore";
import ChatInterface from "@/components/ChatInterface";

// Mock the store
jest.mock("@/stores/useChatStore");

describe("ChatInterface", () => {
  beforeEach(() => {
    (useChatStore as jest.Mock).mockReturnValue({
      conversations: [],
      createConversation: jest.fn(),
      sendMessage: jest.fn(),
      // ... other mocked methods
    });
  });

  it("renders empty state correctly", () => {
    render(<ChatInterface />);
    expect(screen.getByText("Start a new conversation")).toBeInTheDocument();
  });
});
```

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

### Future Scalability Considerations

As the stores grow larger, consider splitting them into multiple files:

```typescript
// For large stores, split into multiple files:
stores/
├── useChatStore.ts          // Main store definition
├── chatTypes.ts             // TypeScript interfaces
├── chatSelectors.ts         // Computed state selectors
├── chatActions.ts           // Complex async actions
├── chatMiddleware.ts        // Custom middleware
└── chatConstants.ts         // Store-specific constants
```

This keeps the codebase maintainable as features expand while preserving the single store per domain principle.

This migration plan provides a solid foundation for moving from the current fragmented state management to a clean, scalable Zustand architecture that eliminates the existing performance and architectural issues while providing better developer experience and maintainability.
