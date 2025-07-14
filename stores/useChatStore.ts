// stores/useChatStore.ts

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  subscribeWithSelector,
  devtools,
} from "zustand/middleware";
import { ChatMessage } from "../lib/types/chat";
import { ChatState, Conversation, ChatError, ChatSelectors } from "./types/chat";
import { STORAGE_KEYS } from "../lib/constants";
import { createLogger } from "./storeUtils";
// Phase 3: Import token management utilities
import { 
  estimateTokenCount, 
  estimateMessagesTokens, 
  getModelTokenLimits, 
  isWithinInputBudget,
  getMaxOutputTokens
} from "../lib/utils/tokens";

const logger = createLogger("ChatStore");

// Helper functions
const generateConversationId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Function to convert string dates back to Date objects after rehydration
const deserializeDates = (conversations: Conversation[]): Conversation[] => {
  return conversations.map(conversation => ({
    ...conversation,
    messages: conversation.messages.map(message => ({
      ...message,
      timestamp: typeof message.timestamp === 'string' ? new Date(message.timestamp) : message.timestamp
    }))
  }));
};

const createNewConversation = (title = "New Chat"): Conversation => ({
  id: generateConversationId(),
  title,
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messageCount: 0,
  totalTokens: 0,
  isActive: false,
  lastMessagePreview: undefined,
  lastMessageTimestamp: undefined,
});

const updateConversationFromMessages = (conversation: Conversation): Conversation => {
  const messages = conversation.messages;
  const messageCount = messages.length;
  const totalTokens = messages.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0);
  const lastMessage = messages[messages.length - 1];
  
  return {
    ...conversation,
    messageCount,
    totalTokens,
    lastModel: lastMessage?.model,
    lastMessagePreview: lastMessage ? 
      (lastMessage.content.length > 100 ? 
        lastMessage.content.substring(0, 100) + "..." : 
        lastMessage.content) : 
      undefined,
    lastMessageTimestamp: lastMessage ? 
      (typeof lastMessage.timestamp === 'string' ? 
        lastMessage.timestamp : 
        lastMessage.timestamp.toISOString()) : 
      undefined,
    updatedAt: new Date().toISOString(),
  };
};

// Create the store with all middleware
export const useChatStore = create<ChatState & ChatSelectors>()(
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
            const id = generateConversationId();
            const newConversation = createNewConversation(title);
            newConversation.id = id;
            newConversation.isActive = true;

            logger.debug("Creating new conversation", { id, title });

            set((state) => ({
              conversations: [newConversation, ...state.conversations.map(c => ({ ...c, isActive: false }))],
              currentConversationId: id,
              error: null,
            }));

            return id;
          },

          switchConversation: (id) => {
            logger.debug("Switching conversation", { id });
            
            set((state) => ({
              conversations: state.conversations.map(conv => ({
                ...conv,
                isActive: conv.id === id,
              })),
              currentConversationId: id,
              error: null,
            }));
          },

          // Phase 3: Context selection method with pair-based and token-based limits
          getContextMessages: (maxTokens: number) => {
            const { currentConversationId, conversations } = get();
            
            if (!currentConversationId) {
              console.log('[Context Selection] No current conversation');
              return [];
            }

            const conversation = conversations.find(c => c.id === currentConversationId);
            if (!conversation) {
              console.log('[Context Selection] No conversation found');
              return [];
            }

            // Exclude the current user message (last message) if it exists
            const messages = conversation.messages.slice(0, -1);
            
            if (messages.length === 0) {
              console.log('[Context Selection] No messages available for context');
              return [];
            }
            
            // Get configuration from environment
            const maxMessagePairs = parseInt(process.env.CONTEXT_MESSAGE_PAIRS || '5', 10);
            
            console.log(`[Context Selection] Starting selection from ${messages.length} available messages`);
            console.log(`[Context Selection] Token budget: ${maxTokens} tokens`);
            console.log(`[Context Selection] Max message pairs: ${maxMessagePairs} pairs`);

            // Strategy: Intelligent pair-based selection with fallback
            const selectedMessages: ChatMessage[] = [];
            let tokenCount = 0;
            let pairCount = 0;

            // Try to select complete user-assistant pairs first
            let pendingUserMessage: ChatMessage | null = null;
            
            for (let i = messages.length - 1; i >= 0 && pairCount < maxMessagePairs; i--) {
              const message = messages[i];
              const messageTokens = estimateTokenCount(message.content) + 4; // structure overhead
              
              // Check token budget first
              if (tokenCount + messageTokens > maxTokens) {
                console.log(`[Context Selection] Would exceed token budget with message ${i}: ${messageTokens} tokens (total would be ${tokenCount + messageTokens})`);
                break;
              }

              if (message.role === 'user') {
                // Store user message, but don't add it yet (wait for complete pair)
                pendingUserMessage = message;
              } else if (message.role === 'assistant' && pendingUserMessage) {
                // Found a complete pair (assistant response to stored user message)
                const pairTokens = messageTokens + estimateTokenCount(pendingUserMessage.content) + 4;
                
                if (tokenCount + pairTokens <= maxTokens) {
                  // Add the complete pair (user first, then assistant)
                  selectedMessages.unshift(pendingUserMessage, message);
                  tokenCount += pairTokens;
                  pairCount++;
                  console.log(`[Context Selection] Added pair ${pairCount}: user+assistant (${pairTokens} tokens, running total: ${tokenCount})`);
                  pendingUserMessage = null; // Reset
                } else {
                  console.log(`[Context Selection] Pair would exceed token budget: ${pairTokens} tokens`);
                  break;
                }
              } else if (message.role === 'assistant' && !pendingUserMessage) {
                // Orphaned assistant message (no prior user message) - might be from a failure
                if (tokenCount + messageTokens <= maxTokens) {
                  selectedMessages.unshift(message);
                  tokenCount += messageTokens;
                  console.log(`[Context Selection] Added orphaned assistant message: ${messageTokens} tokens (running total: ${tokenCount})`);
                }
              }
            }
            
            // If we have an unpaired user message at the end, try to include it
            if (pendingUserMessage && tokenCount + estimateTokenCount(pendingUserMessage.content) + 4 <= maxTokens) {
              selectedMessages.unshift(pendingUserMessage);
              tokenCount += estimateTokenCount(pendingUserMessage.content) + 4;
              console.log(`[Context Selection] Added unpaired user message: ${estimateTokenCount(pendingUserMessage.content) + 4} tokens (running total: ${tokenCount})`);
            }
            
            // If we still have budget and fewer than maxMessagePairs, add older messages individually
            if (pairCount < maxMessagePairs && tokenCount < maxTokens) {
              const earliestIncludedIndex = selectedMessages.length > 0 ? 
                messages.findIndex(m => m.id === selectedMessages[0].id) : messages.length;
              
              for (let i = earliestIncludedIndex - 1; i >= 0; i--) {
                const message = messages[i];
                const messageTokens = estimateTokenCount(message.content) + 4;
                
                if (tokenCount + messageTokens > maxTokens) {
                  break;
                }
                
                selectedMessages.unshift(message);
                tokenCount += messageTokens;
                console.log(`[Context Selection] Added individual message ${i}: ${messageTokens} tokens (running total: ${tokenCount})`);
              }
            }

            console.log(`[Context Selection] Final: ${selectedMessages.length} messages, ${pairCount} complete pairs, ${tokenCount}/${maxTokens} tokens`);
            console.log(`[Context Selection] Message breakdown: ${selectedMessages.map(m => m.role).join(' → ')}`);
            
            return selectedMessages;
          },

          sendMessage: async (content, model) => {
            if (!content.trim() || get().isLoading) {
              logger.warn("Cannot send message: empty content or already loading");
              return;
            }

            let { currentConversationId } = get();

            // Create new conversation if none exists
            if (!currentConversationId) {
              logger.debug("No current conversation, creating new one");
              currentConversationId = get().createConversation();
            }

            const userMessage: ChatMessage = {
              id: generateMessageId(),
              content: content.trim(),
              role: "user",
              timestamp: new Date(),
            };

            logger.debug("Sending message", { conversationId: currentConversationId, content: content.substring(0, 50) + "..." });

            // Add user message optimistically
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === state.currentConversationId
                  ? updateConversationFromMessages({
                      ...conv,
                      messages: [...conv.messages, userMessage],
                    })
                  : conv
              ),
              isLoading: true,
              error: null,
            }));

            try {
              // Phase 3: Check if context-aware mode is enabled
              const isContextAwareEnabled = process.env.NEXT_PUBLIC_ENABLE_CONTEXT_AWARE === 'true';
              
              console.log(`[Send Message] Context-aware mode: ${isContextAwareEnabled ? 'ENABLED' : 'DISABLED'}`);
              console.log(`[Send Message] Model: ${model || 'default'}`);

              let requestBody: { message: string; model?: string; messages?: ChatMessage[] };

              if (isContextAwareEnabled) {
                // Phase 3: Get model-specific token limits and select context
                const strategy = getModelTokenLimits(model);
                console.log(`[Send Message] Token strategy - Input: ${strategy.maxInputTokens}, Output: ${strategy.maxOutputTokens}`);

                // Get context messages within token budget
                const contextMessages = get().getContextMessages(strategy.maxInputTokens);
                
                // Build complete message array (context + new message)
                const allMessages = [...contextMessages, userMessage];
                
                // Calculate total token usage
                const totalTokens = estimateMessagesTokens(allMessages);
                console.log(`[Send Message] Total message tokens: ${totalTokens}/${strategy.maxInputTokens}`);
                
                // Validate budget
                if (!isWithinInputBudget(totalTokens, strategy)) {
                  console.log(`[Send Message] Token budget exceeded, falling back to progressive reduction`);
                  
                  // Progressive fallback: try smaller context
                  const fallbackSizes = [
                    Math.floor(strategy.maxInputTokens * 0.8),
                    Math.floor(strategy.maxInputTokens * 0.6),
                    Math.floor(strategy.maxInputTokens * 0.4),
                    Math.floor(strategy.maxInputTokens * 0.2),
                    estimateTokenCount(userMessage.content) + 20 // Just user message + buffer
                  ];
                  
                  let finalContextMessages = contextMessages;
                  for (const fallbackSize of fallbackSizes) {
                    const reducedContext = get().getContextMessages(fallbackSize);
                    const reducedTotal = estimateMessagesTokens([...reducedContext, userMessage]);
                    
                    if (reducedTotal <= strategy.maxInputTokens) {
                      finalContextMessages = reducedContext;
                      console.log(`[Send Message] Using fallback context: ${reducedContext.length} messages, ${reducedTotal} tokens`);
                      break;
                    }
                  }
                  
                  // Build request with conversation context
                  requestBody = { 
                    message: content, 
                    messages: [...finalContextMessages, userMessage]
                  };
                } else {
                  // Build request with conversation context
                  requestBody = { 
                    message: content, 
                    messages: allMessages
                  };
                }
                
                if (model) {
                  requestBody.model = model;
                }
                
                console.log(`[Send Message] Sending NEW format with ${requestBody.messages?.length || 0} messages`);
              } else {
                // Legacy format
                requestBody = { message: content };
                if (model) {
                  requestBody.model = model;
                }
                console.log(`[Send Message] Sending LEGACY format (single message)`);
              }

              const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const chatError: ChatError = {
                  message: errorData.error ?? `HTTP error! status: ${response.status}`,
                  code: errorData.code,
                  suggestions: errorData.suggestions,
                  retryAfter: errorData.retryAfter,
                  timestamp: errorData.timestamp ?? new Date().toISOString(),
                };
                throw chatError;
              }

              // Handle backend response with 'data' property
              const raw = await response.json();
              const data = raw.data ?? raw;

              if (data.error) {
                throw new Error(data.error);
              }

              const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                content: data.response,
                role: "assistant",
                timestamp: new Date(),
                elapsed_time: data.elapsed_time ?? 0,
                total_tokens: data.usage?.total_tokens ?? 0,
                model: data.model || model,
                contentType: data.contentType || "text",
                completion_id: data.id,
              };

              // Add assistant response and update conversation metadata
              set((state) => ({
                conversations: state.conversations.map((conv) =>
                  conv.id === state.currentConversationId
                    ? updateConversationFromMessages({
                        ...conv,
                        messages: [...conv.messages, assistantMessage],
                      })
                    : conv
                ),
                isLoading: false,
              }));

              // Auto-generate title from first user message if it's still "New Chat"
              const currentConv = get().conversations.find(c => c.id === currentConversationId);
              if (currentConv && currentConv.title === "New Chat" && currentConv.messages.length === 2) {
                const title = content.length > 50 ? content.substring(0, 50) + "..." : content;
                get().updateConversationTitle(currentConversationId, title);
              }

              logger.debug("Message sent successfully", { conversationId: currentConversationId });

            } catch (err) {
              let chatError: ChatError;
              
              if (typeof err === 'object' && err !== null && 'code' in err && typeof (err as ChatError).code === 'string') {
                // Already a ChatError with code
                chatError = err as ChatError;
              } else {
                // Convert Error or other type to ChatError
                const errorMessage = err instanceof Error ? err.message : "An error occurred";
                chatError = {
                  message: errorMessage,
                  code: (errorMessage.includes("fetch") || errorMessage.includes("Network")) ? "network_error" : "unknown_error",
                };
              }

              logger.error("Failed to send message", { error: chatError });

              // Mark user message as failed and add error state
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
                error: chatError,
              }));

              // For development: Add a mock response when backend is not available
              if (chatError.code === "network_error") {
                const mockResponse: ChatMessage = {
                  id: generateMessageId(),
                  content: "I'm currently not available. The backend API is being developed by Gemini CLI. Please check back later!",
                  role: "assistant",
                  timestamp: new Date(),
                };

                set((state) => ({
                  conversations: state.conversations.map((conv) =>
                    conv.id === state.currentConversationId
                      ? updateConversationFromMessages({
                          ...conv,
                          messages: [...conv.messages, mockResponse],
                        })
                      : conv
                  ),
                }));
              }
            }
          },

          updateConversationTitle: (id, title) => {
            logger.debug("Updating conversation title", { id, title });
            
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === id
                  ? { ...conv, title, updatedAt: new Date().toISOString() }
                  : conv
              ),
            }));
          },

          deleteConversation: (id) => {
            logger.debug("Deleting conversation", { id });
            
            set((state) => {
              const newConversations = state.conversations.filter(c => c.id !== id);
              const newCurrentId = state.currentConversationId === id
                ? newConversations[0]?.id ?? null
                : state.currentConversationId;

              return {
                conversations: newConversations,
                currentConversationId: newCurrentId,
                error: null,
              };
            });
          },

          clearCurrentMessages: () => {
            const { currentConversationId } = get();
            if (!currentConversationId) return;

            logger.debug("Clearing current conversation messages", { conversationId: currentConversationId });

            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === currentConversationId
                  ? updateConversationFromMessages({ ...conv, messages: [] })
                  : conv
              ),
              error: null,
            }));
          },

          clearError: () => {
            set({ error: null });
          },

          clearMessageError: (messageId) => {
            const { currentConversationId } = get();
            if (!currentConversationId) return;

            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === currentConversationId
                  ? {
                      ...conv,
                      messages: conv.messages.map((msg) =>
                        msg.id === messageId ? { ...msg, error: false } : msg
                      ),
                    }
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
              logger.debug("Retrying last message", { messageId: lastUserMessage.id });
              
              // Clear error first
              get().clearError();
              get().clearMessageError(lastUserMessage.id);
              
              // Resend with the same content
              await get().sendMessage(lastUserMessage.content);
            }
          },

          _hasHydrated: () => {
            set({ isHydrated: true });
          },

          // Selectors
          getCurrentConversation: () => {
            const { conversations, currentConversationId } = get();
            return conversations.find(c => c.id === currentConversationId) || null;
          },

          getCurrentMessages: () => {
            const conversation = get().getCurrentConversation();
            return conversation?.messages || [];
          },

          getConversationById: (id) => {
            return get().conversations.find(c => c.id === id) || null;
          },

          getConversationCount: () => {
            return get().conversations.length;
          },

          getTotalMessages: () => {
            return get().conversations.reduce((total, conv) => total + conv.messageCount, 0);
          },

          getRecentConversations: (limit = 10) => {
            return get().conversations
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, limit);
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
            if (state?.conversations) {
              // Convert string dates back to Date objects
              state.conversations = deserializeDates(state.conversations);
            }
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

// Backward compatibility hook that maintains the same API as the original useChat
export const useChat = () => {
  const {
    getCurrentMessages,
    isLoading,
    error,
    sendMessage,
    clearCurrentMessages,
    clearError,
    clearMessageError,
    retryLastMessage,
    isHydrated,
  } = useChatStore();

  // Don't return data until hydrated to prevent SSR mismatch
  if (!isHydrated) {
    return {
      messages: [],
      isLoading: false,
      error: null,
      sendMessage: async () => {},
      clearMessages: () => {},
      clearError: () => {},
      clearMessageError: () => {},
      retryLastMessage: async () => {},
    };
  }

  return {
    messages: getCurrentMessages(),
    isLoading,
    error,
    sendMessage,
    clearMessages: clearCurrentMessages,
    clearError,
    clearMessageError,
    retryLastMessage,
  };
};
