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
import { useAuthStore } from "./useAuthStore";
import { syncManager } from "../lib/utils/syncManager";
import { persistAssistantImages } from "../lib/utils/persistAssistantImages";
// Phase 3: Import token management utilities
import { 
  estimateTokenCount, 
  estimateMessagesTokens, 
  getModelTokenLimits, 
  isWithinInputBudget
} from "../lib/utils/tokens";
import toast from 'react-hot-toast';
import { checkRateLimitHeaders } from "../lib/utils/rateLimitNotifications";
import { emitAnonymousError, emitAnonymousUsage } from "../lib/analytics/anonymous";

const logger = createLogger("ChatStore");

// Phase 3 (streaming images): Memory-only image retention configuration
const IMAGE_RETENTION = {
  PER_MESSAGE_MAX: 4, // max images kept per assistant message
  CONVERSATION_MAX_BYTES: 3 * 1024 * 1024, // 3MB soft cap per conversation
};

// Measure approximate size of data URL images (base64 length) – heuristic only
const approximateImagesBytes = (images?: string[]) => {
  if (!Array.isArray(images)) return 0;
  return images.reduce((sum, dataUrl) => sum + (typeof dataUrl === 'string' ? dataUrl.length : 0), 0);
};

// Create a shallow cloned conversation with image payloads trimmed according to limits
function applyImageLimits(conv: Conversation): Conversation {
  let bytesSoFar = 0;
  const messages = conv.messages.map(m => {
    if (m.role !== 'assistant' || !Array.isArray(m.output_images) || m.output_images.length === 0) return m;
    // Enforce per-message cap (keep earliest images first – order should reflect generation order)
    let imgs = m.output_images.slice(0, IMAGE_RETENTION.PER_MESSAGE_MAX);
    // If we already exceeded conversation cap, drop images entirely
    const imagesBytes = approximateImagesBytes(imgs);
    if (bytesSoFar + imagesBytes > IMAGE_RETENTION.CONVERSATION_MAX_BYTES) {
      imgs = [];
    } else {
      bytesSoFar += imagesBytes;
      // If adding next message would overflow, future messages will be dropped
    }
    if (imgs.length !== m.output_images.length) {
      return { ...m, output_images: imgs.length > 0 ? imgs : undefined };
    }
    return m;
  });
  return { ...conv, messages };
}

// Strip all image data (used during persistence) so images stay memory-only
function stripAllImages(conversations: Conversation[]): Conversation[] {
  return conversations.map(c => ({
    ...c,
    messages: c.messages.map(m => {
      if (m.role === 'assistant' && m.output_images) {
  // Clone while removing images; retain other fields (maintain ChatMessage structural typing)
  const clone = { ...m };
        delete clone.output_images;
        return clone;
      }
      return m;
    })
  }));
}

// In-flight guard for per-session message loads to prevent duplicate fetches
const messagesInflight = new Set<string>();

// Helper functions
const generateConversationId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Ordering helpers
const tsToMillis = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
const sortByLastTimestampDesc = (a: Conversation, b: Conversation) =>
  tsToMillis(b.lastMessageTimestamp || b.updatedAt || b.createdAt) -
  tsToMillis(a.lastMessageTimestamp || a.updatedAt || a.createdAt);

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

const createNewConversation = (title = "New Chat", userId?: string): Conversation => ({
  id: generateConversationId(),
  title,
  messages: [],
  userId, // Include userId for authenticated users
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messageCount: 0,
  totalTokens: 0,
  isActive: false,
  lastMessagePreview: undefined,
  lastMessageTimestamp: undefined,
});

// Export helper function for use in streaming hook
export const updateConversationFromMessages = (conversation: Conversation): Conversation => {
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
          sidebarPaging: {
            pageSize: 20,
            loading: false,
            hasMore: false,
            nextCursor: null,
            initialized: false,
          },
          // Ephemeral banners (session-only, not persisted)
          conversationErrorBanners: {},

          // Sync state
          isSyncing: false,
          lastSyncTime: null,
          syncError: null,
          syncInProgress: false,

          // Search state
          searchQuery: '',
          searchMode: 'inactive',
          searchResults: [],
          searchLoading: false,
          searchError: null,

          // Actions
          createConversation: (title = "New Chat") => {
            const id = generateConversationId();
            const { user } = useAuthStore.getState();
            const newConversation = createNewConversation(title, user?.id);
            newConversation.id = id;
            newConversation.isActive = true;

            logger.debug("Creating new conversation", { id, title, userId: user?.id });

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

            // If authenticated, trigger lazy load/revalidation of messages for this conversation
            const { user } = useAuthStore.getState();
            if (user) {
              const conv = get().conversations.find(c => c.id === id);
              // Always call loader: it will either full-load or incrementally revalidate via since_ts
              if (conv) {
                get().loadConversationMessages?.(id).catch((err) => {
                  logger.warn("Failed to load conversation messages", { id, err });
                });
              }
            }
          },

          // Phase 3: Context selection method with pair-based and token-based limits
          getContextMessages: (maxTokens: number) => {
            const { currentConversationId, conversations } = get();
            
            if (!currentConversationId) {
              logger.debug('[Context Selection] No current conversation');
              return [];
            }

            const conversation = conversations.find(c => c.id === currentConversationId);
            if (!conversation) {
              logger.debug('[Context Selection] No conversation found');
              return [];
            }

            // Exclude the current user message (last message) if it exists
            const messages = conversation.messages.slice(0, -1);
            
            if (messages.length === 0) {
              logger.debug('[Context Selection] No messages available for context');
              return [];
            }
            
            // Get configuration from environment
            const maxMessagePairs = parseInt(process.env.CONTEXT_MESSAGE_PAIRS || '5', 10);
            
            logger.debug(`[Context Selection] Starting selection from ${messages.length} available messages`);
            logger.debug(`[Context Selection] Token budget: ${maxTokens} tokens`);
            logger.debug(`[Context Selection] Max message pairs: ${maxMessagePairs} pairs`);

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
                logger.debug(`[Context Selection] Would exceed token budget with message ${i}: ${messageTokens} tokens (total would be ${tokenCount + messageTokens})`);
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
                  logger.debug(`[Context Selection] Added pair ${pairCount}: user+assistant (${pairTokens} tokens, running total: ${tokenCount})`);
                  pendingUserMessage = null; // Reset
                } else {
                  logger.debug(`[Context Selection] Pair would exceed token budget: ${pairTokens} tokens`);
                  break;
                }
              } else if (message.role === 'assistant' && !pendingUserMessage) {
                // Orphaned assistant message (no prior user message) - might be from a failure
                if (tokenCount + messageTokens <= maxTokens) {
                  selectedMessages.unshift(message);
                  tokenCount += messageTokens;
                  logger.debug(`[Context Selection] Added orphaned assistant message: ${messageTokens} tokens (running total: ${tokenCount})`);
                }
              }
            }
            
            // If we have an unpaired user message at the end, try to include it
            if (pendingUserMessage && tokenCount + estimateTokenCount(pendingUserMessage.content) + 4 <= maxTokens) {
              selectedMessages.unshift(pendingUserMessage);
              tokenCount += estimateTokenCount(pendingUserMessage.content) + 4;
              logger.debug(`[Context Selection] Added unpaired user message: ${estimateTokenCount(pendingUserMessage.content) + 4} tokens (running total: ${tokenCount})`);
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
        logger.debug(`[Context Selection] Added individual message ${i}: ${messageTokens} tokens (running total: ${tokenCount})`);
              }
            }

      logger.debug(`[Context Selection] Final: ${selectedMessages.length} messages, ${pairCount} complete pairs, ${tokenCount}/${maxTokens} tokens`);
      logger.debug(`[Context Selection] Message breakdown: ${selectedMessages.map(m => m.role).join(' → ')}`);
            
            return selectedMessages;
          },

          sendMessage: async (content, model, options: { attachmentIds?: string[]; draftId?: string; webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' }; imageOutput?: boolean } | undefined) => {
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
              originalModel: model, // Store the model used for this message (for retry purposes)
              has_attachments: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? true : undefined,
              attachment_ids: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? options!.attachmentIds : undefined,
              // Store that this was sent in non-streaming mode
              was_streaming: false,
              // Capture request-side options for accurate retry later
              requested_web_search: options?.webSearch,
              requested_web_max_results: options?.webMaxResults,
              requested_reasoning_effort: options?.reasoning?.effort,
              // Phase 2: image output request flag for retry & persistence mapping
              requested_image_output: options?.imageOutput || false,
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
              
              logger.debug(`[Send Message] Context-aware mode: ${isContextAwareEnabled ? 'ENABLED' : 'DISABLED'}`);
              logger.debug(`[Send Message] Model: ${model || 'default'}`);

              let requestBody: { message: string; model?: string; messages?: ChatMessage[]; current_message_id?: string; attachmentIds?: string[]; draftId?: string; webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' }; imageOutput?: boolean };

              if (isContextAwareEnabled) {
                // Phase 3: Get model-specific token limits and select context
                const strategy = await getModelTokenLimits(model);
                logger.debug(`[Send Message] Token strategy - Input: ${strategy.maxInputTokens}, Output: ${strategy.maxOutputTokens}`);

                // Get context messages within token budget
                const contextMessagesRaw = get().getContextMessages(strategy.maxInputTokens);
                // Filter out failed user messages (error) and assistant messages whose linked user failed
                const contextMessages = contextMessagesRaw.filter(m => {
                  if (m.role === 'user' && m.error) return false;
                  if (m.role === 'assistant' && m.user_message_id) {
                    const linked = contextMessagesRaw.find(x => x.id === m.user_message_id);
                    if (linked?.error) return false;
                  }
                  return true;
                });
                
                // Build complete message array (context + new message)
                const allMessages = [...contextMessages, userMessage];
                
                // Calculate total token usage
                const totalTokens = estimateMessagesTokens(allMessages);
                logger.debug(`[Send Message] Total message tokens: ${totalTokens}/${strategy.maxInputTokens}`);
                
                // Validate budget
                if (!isWithinInputBudget(totalTokens, strategy)) {
                  logger.debug(`[Send Message] Token budget exceeded, falling back to progressive reduction`);
                  
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
                      logger.debug(`[Send Message] Using fallback context: ${reducedContext.length} messages, ${reducedTotal} tokens`);
                      break;
                    }
                  }
                  
                  // Build request with conversation context
                  requestBody = { 
                    message: content, 
                    messages: [...finalContextMessages, userMessage],
                    current_message_id: userMessage.id,
                    attachmentIds: options?.attachmentIds,
                    draftId: options?.draftId,
                    webSearch: options?.webSearch,
                    webMaxResults: options?.webMaxResults,
                    reasoning: options?.reasoning,
                    imageOutput: !!options?.imageOutput,
                  };
                } else {
                  // Build request with conversation context
                  requestBody = { 
                    message: content, 
                    messages: allMessages,
                    current_message_id: userMessage.id,
                    attachmentIds: options?.attachmentIds,
                    draftId: options?.draftId,
                    webSearch: options?.webSearch,
                    webMaxResults: options?.webMaxResults,
                    reasoning: options?.reasoning,
                    imageOutput: !!options?.imageOutput,
                  };
                }
                
                if (model) {
                  requestBody.model = model;
                }
                
                logger.debug(`[Send Message] Sending NEW format with ${requestBody.messages?.length || 0} messages`);
              } else {
                // Legacy format
                requestBody = { message: content, current_message_id: userMessage.id, attachmentIds: options?.attachmentIds, draftId: options?.draftId, webSearch: options?.webSearch, webMaxResults: options?.webMaxResults, reasoning: options?.reasoning, imageOutput: !!options?.imageOutput };
                if (model) {
                  requestBody.model = model;
                }
                logger.debug(`[Send Message] Sending LEGACY format (single message)`);
              }

              // Ensure chronological ordering & stability
              if (requestBody.messages) {
                const toMillis = (t: Date | string | undefined) => {
                  if (!t) return 0;
                  return t instanceof Date ? t.getTime() : new Date(t).getTime();
                };
                requestBody.messages = [...requestBody.messages]
                  .sort((a, b) => toMillis(a.timestamp as Date | string | undefined) - toMillis(b.timestamp as Date | string | undefined));
              }

              const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                // Check rate limit headers even on error responses (429 rate limit errors)
                checkRateLimitHeaders(response);
                
                const errorData = await response.json().catch(() => ({}));
                const chatError: ChatError = {
                  message: errorData.error ?? `HTTP error! status: ${response.status}`,
                  code: errorData.code,
                  upstreamErrorCode: errorData.upstreamErrorCode,
                  upstreamErrorMessage: errorData.upstreamErrorMessage,
                  suggestions: errorData.suggestions,
                  retryAfter: errorData.retryAfter,
                  timestamp: errorData.timestamp ?? new Date().toISOString(),
                };
                // Anonymous error emit
                try {
                  const { user } = useAuthStore.getState();
                  if (!user?.id) {
                    emitAnonymousError({
                      timestamp: new Date().toISOString(),
                      model: String(model || ''),
                      http_status: response.status,
                      error_code: typeof errorData.code === 'string' ? errorData.code : undefined,
                      error_message: typeof errorData.error === 'string' ? errorData.error : `HTTP ${response.status}`,
                      // Upstream provider metadata when available
                      provider: typeof errorData.upstreamProvider === 'string' ? errorData.upstreamProvider : undefined,
                      provider_request_id: typeof errorData.upstreamProviderRequestId === 'string' ? errorData.upstreamProviderRequestId : undefined,
                      metadata: {
                        streaming: false,
                        ...(errorData.upstreamErrorCode !== undefined ? { upstreamErrorCode: errorData.upstreamErrorCode } : {}),
                        ...(errorData.upstreamErrorMessage ? { upstreamErrorMessage: errorData.upstreamErrorMessage } : {}),
                        // Correlate with our API request id if provided
                        ...(response.headers.get('x-request-id') ? { api_request_id: response.headers.get('x-request-id') as string } : {}),
                      },
                    });
                  }
                } catch {}
                throw chatError;
              }

              // Check rate limit headers for proactive notifications
              checkRateLimitHeaders(response);

              // Handle backend response with 'data' property
              const raw = await response.json();
              const data = raw.data ?? raw;

              if (data.error) {
                throw new Error(data.error);
              }

              type ChatResponseWithReasoning = {
                reasoning?: string;
                reasoning_details?: Record<string, unknown>[];
              };
              const respWithReasoning = data as ChatResponseWithReasoning;
              
              // Apply provider-aware token correction (OpenAI image models need recalculation)
              const { correctTokensForProvider } = await import('../lib/utils/tokenCalculations');
              const correctedTokens = correctTokensForProvider(
                {
                  prompt_tokens: data.usage?.prompt_tokens,
                  completion_tokens: data.usage?.completion_tokens,
                  total_tokens: data.usage?.total_tokens,
                  completion_tokens_details: data.usage?.completion_tokens_details
                },
                data.model || model
              );
              
              const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                content: data.response,
                role: "assistant",
                timestamp: new Date(),
                elapsed_ms: data.elapsed_ms ?? 0,
                total_tokens: correctedTokens.total_tokens,
                input_tokens: correctedTokens.input_tokens,
                output_tokens: correctedTokens.output_tokens,
                // Phase 4A: Extract image tokens from completion_tokens_details if present
                ...(correctedTokens.output_image_tokens && {
                  output_image_tokens: correctedTokens.output_image_tokens
                }),
                user_message_id: data.request_id, // Link to the user message that triggered this response
                model: data.model || model,
                contentType: data.contentType || "text",
                completion_id: data.id,
                // Mark assistant as non-streaming in this path
                was_streaming: false,
                has_websearch: !!data.has_websearch,
                websearch_result_count: typeof data.websearch_result_count === 'number' ? data.websearch_result_count : undefined,
                annotations: Array.isArray(data.annotations) ? data.annotations : undefined,
                reasoning: typeof respWithReasoning.reasoning === 'string' ? respWithReasoning.reasoning : undefined,
                reasoning_details: respWithReasoning.reasoning_details && Array.isArray(respWithReasoning.reasoning_details) ? respWithReasoning.reasoning_details : undefined,
                // Phase 2: Map transient output_images (data URLs) for inline gallery rendering
                output_images: Array.isArray(data.output_images) && data.output_images.length > 0 ? data.output_images : undefined,
              };

              // Add assistant response and update conversation metadata
              // Also update the user message with input tokens if we have a request_id
              set((state) => {
                const currentConv = state.conversations.find(c => c.id === state.currentConversationId);
                
                // Validation: Check if request_id matches any user message
                if (data.request_id && currentConv) {
                  const matchingUserMessage = currentConv.messages.find(m => m.id === data.request_id && m.role === 'user');
                  if (matchingUserMessage) {
                    logger.debug("Updating user message with input tokens", { 
                      messageId: data.request_id, 
                      inputTokens: data.usage?.prompt_tokens,
                      messageContent: matchingUserMessage.content.substring(0, 50) + "..."
                    });
                  } else {
                    logger.warn("Warning: request_id not found in user messages", { 
                      requestId: data.request_id,
                      availableUserMessages: currentConv.messages.filter(m => m.role === 'user').map(m => ({ id: m.id, content: m.content.substring(0, 30) + "..." }))
                    });
                  }
                }

                return {
                  conversations: state.conversations.map((conv) =>
                    conv.id === state.currentConversationId
                      ? updateConversationFromMessages({
                          ...conv,
                          messages: [
                            ...conv.messages.map((msg) =>
                              // Update the user message that triggered this response with input tokens
                              msg.id === data.request_id && msg.role === 'user'
                                ? { ...msg, input_tokens: data.usage?.prompt_tokens ?? 0 }
                                : msg
                            ),
                            assistantMessage
                          ],
                        })
                      : conv
                  ),
                  isLoading: false,
                };
              });

              // Anonymous usage emit on success (best-effort)
              try {
                const { user } = useAuthStore.getState();
                if (!user?.id) {
                  // Find the updated user message in state if available
                  const conv = get().conversations.find(c => c.id === currentConversationId);
                  const updatedUserMsg = conv?.messages.find(m => m.id === (data.request_id as string));
                  const inputTokens = (updatedUserMsg?.input_tokens as number) ?? (data.usage?.prompt_tokens ?? 0);
                  emitAnonymousUsage([
                    { timestamp: new Date().toISOString(), type: 'message_sent', model },
                    {
                      timestamp: new Date().toISOString(),
                      type: 'completion_received',
                      model: assistantMessage.model,
                      input_tokens: inputTokens,
                      output_tokens: assistantMessage.output_tokens,
                      elapsed_ms: assistantMessage.elapsed_ms,
                    },
                  ]);
                }
              } catch {}

              // Auto-generate title from first user message if it's still "New Chat"
              const currentConv = get().conversations.find(c => c.id === currentConversationId);
              if (currentConv && currentConv.title === "New Chat" && currentConv.messages.length === 2) {
                const autoTitle = content.length > 50 ? content.substring(0, 50) + "..." : content;
                get().updateConversationTitle(currentConversationId, autoTitle, true); // Mark as auto-generated
              }

              // Save individual messages after successful response (Phase 3 implementation)
              const { user } = useAuthStore.getState();
              if (user?.id && currentConv?.userId === user.id) {
                logger.debug("Saving user/assistant message pair", { conversationId: currentConversationId });
                // Use setTimeout to avoid blocking the UI update
                setTimeout(async () => {
                  try {
                    // Get the updated conversation state with input_tokens applied to user message
                    const updatedConv = get().conversations.find(c => c.id === currentConversationId);
                    const updatedUserMessage = updatedConv?.messages.find(m => m.id === data.request_id && m.role === 'user');
                    
                    // Check if this is a newly titled conversation (first successful exchange)
                    const shouldIncludeTitle = updatedConv && 
                      updatedConv.title !== "New Chat" && 
                      updatedConv.messages.length === 2;
                    
                    if (updatedUserMessage) {
                      logger.debug("Using updated user message with input_tokens", { 
                        messageId: updatedUserMessage.id,
                        inputTokens: updatedUserMessage.input_tokens,
                        hasInputTokens: updatedUserMessage.input_tokens !== undefined && updatedUserMessage.input_tokens > 0,
                        includeTitle: shouldIncludeTitle,
                        title: shouldIncludeTitle ? updatedConv?.title : undefined
                      });
                      
                      // Phase 4A: Create cleaned assistant message for database persistence (same as streaming)
                      const assistantMessageForDB = { ...assistantMessage };
                      
                      // Remove data URLs from output_images for database payload (keep count only)
                      if (assistantMessageForDB.output_images && assistantMessageForDB.output_images.length > 0) {
                        // Add image count for database tracking
                        assistantMessageForDB.output_image_count = assistantMessage.output_images!.length;
                        
                        // Remove actual data URLs from database payload (too large for DB)
                        delete assistantMessageForDB.output_images;
                      }
                      
                      // Note: output_tokens already corrected by correctTokensForProvider() - no need for additional subtraction
                      
                      // Save user and assistant messages as a pair - now with correct input_tokens and optional title
                      const payload: {
                        messages: ChatMessage[];
                        sessionId: string;
                        sessionTitle?: string;
                        attachmentIds?: string[];
                      } = {
                        messages: [updatedUserMessage, assistantMessageForDB],
                        sessionId: currentConversationId,
                        attachmentIds: options?.attachmentIds,
                      };
                      
                      // Include title for newly titled conversations
                      if (shouldIncludeTitle) {
                        payload.sessionTitle = updatedConv?.title;
                      }
                      
                      await fetch("/api/chat/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      // Update lastSyncTime after successful persistence
                      set({ lastSyncTime: new Date().toISOString(), syncError: null });
                      
                      // Phase 4A: Persist assistant images AFTER database sync (fixes timing race condition)
                      if (assistantMessage.output_images && assistantMessage.output_images.length > 0) {
                        persistAssistantImages(
                          assistantMessage.output_images, 
                          assistantMessage.id, 
                          currentConversationId
                        ).then((persistedUrls: string[]) => {
                          // Update the assistant message with persisted URLs (swap data URLs for signed URLs)
                          set((state) => ({
                            conversations: state.conversations.map((conv) =>
                              conv.id === currentConversationId
                                ? {
                                    ...conv,
                                    messages: conv.messages.map(msg =>
                                      msg.id === assistantMessage.id 
                                        ? { ...msg, output_images: persistedUrls }
                                        : msg
                                    ),
                                  }
                                : conv
                            ),
                          }));
                        }).catch((error: unknown) => {
                          logger.warn('Failed to persist assistant images, keeping data URLs', { 
                            messageId: assistantMessage.id, 
                            error 
                          });
                          // Images remain as data URLs - graceful degradation
                        });
                      }
                      
                      toast.success('Message saved successfully!', { id: 'chat-message-saved' });
                      logger.debug("Message pair saved successfully with correct tokens", { 
                        userMessageId: updatedUserMessage.id,
                        userInputTokens: updatedUserMessage.input_tokens,
                        assistantMessageId: assistantMessage.id,
                        titleIncluded: shouldIncludeTitle
                      });
                    } else {
                      logger.warn("Could not find updated user message, falling back to original", {
                        requestId: data.request_id,
                        conversationId: currentConversationId
                      });
                      // Fallback to original userMessage if updated one not found
                      
                      // Phase 4A: Create cleaned assistant message for database persistence (fallback path)
                      const assistantMessageForDB = { ...assistantMessage };
                      
                      // Remove data URLs from output_images for database payload (keep count only)
                      if (assistantMessageForDB.output_images && assistantMessageForDB.output_images.length > 0) {
                        // Add image count for database tracking
                        assistantMessageForDB.output_image_count = assistantMessage.output_images!.length;
                        
                        // Remove actual data URLs from database payload (too large for DB)
                        delete assistantMessageForDB.output_images;
                      }
                      
                      // Note: output_tokens already corrected by correctTokensForProvider() - no need for additional subtraction
                      
                      const payload: {
                        messages: ChatMessage[];
                        sessionId: string;
                        sessionTitle?: string;
                        attachmentIds?: string[];
                      } = {
                        messages: [userMessage, assistantMessageForDB],
                        sessionId: currentConversationId,
                        attachmentIds: options?.attachmentIds,
                      };
                      
                      // Include title for newly titled conversations
                      if (shouldIncludeTitle) {
                        payload.sessionTitle = updatedConv?.title;
                      }
                      
                      await fetch("/api/chat/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      // Update lastSyncTime after successful persistence (fallback path)
                      set({ lastSyncTime: new Date().toISOString(), syncError: null });
                      
                      // Phase 4A: Persist assistant images AFTER database sync (fallback path)
                      if (assistantMessage.output_images && assistantMessage.output_images.length > 0) {
                        persistAssistantImages(
                          assistantMessage.output_images, 
                          assistantMessage.id, 
                          currentConversationId
                        ).then((persistedUrls: string[]) => {
                          // Update the assistant message with persisted URLs (swap data URLs for signed URLs)
                          set((state) => ({
                            conversations: state.conversations.map((conv) =>
                              conv.id === currentConversationId
                                ? {
                                    ...conv,
                                    messages: conv.messages.map(msg =>
                                      msg.id === assistantMessage.id 
                                        ? { ...msg, output_images: persistedUrls }
                                        : msg
                                    ),
                                  }
                                : conv
                            ),
                          }));
                        }).catch((error: unknown) => {
                          logger.warn('Failed to persist assistant images, keeping data URLs', { 
                            messageId: assistantMessage.id, 
                            error 
                          });
                          // Images remain as data URLs - graceful degradation
                        });
                      }
                      
                      toast.success('Message saved successfully!', { id: 'chat-message-saved' });
                    }
                  } catch (error) {
                    logger.debug("Message save failed (silent)", error);
                  }
                }, 100);
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
                            ? { 
                                ...msg, 
                                error: true, 
                                input_tokens: 0, // Ensure input_tokens is 0 for failed requests
                                error_message: chatError.message, // Map error_message to user message
                                error_code: chatError.code,
                                upstream_error_code: chatError.upstreamErrorCode,
                                upstream_error_message: chatError.upstreamErrorMessage,
                                retry_after: chatError.retryAfter,
                                retry_available: true,
                              }
                            : msg
                        ),
                      }
                    : conv
                ),
                isLoading: false,
                error: chatError,
              }));

              // Set ephemeral banner for current conversation (session-only)
              const convId = get().currentConversationId;
              if (convId) {
                get().setConversationErrorBanner(convId, {
                  messageId: userMessage.id,
                  message: chatError.message,
                  code: chatError.code,
                  retryAfter: chatError.retryAfter,
                  createdAt: new Date().toISOString(),
                });
              }

              // Note: We no longer add a mock assistant message on errors.
              // The ErrorDisplay banner handles user-facing error feedback.

              // Phase 3: Save error message to database for authenticated users
              const { user } = useAuthStore.getState();
              if (user?.id && currentConversationId) {
                // Save failed user message with error_message mapped to it
                setTimeout(async () => {
                  try {
                    // Get the updated user message from state (with error_message, input_tokens: 0 and error: true)
                    const updatedConv = get().conversations.find(c => c.id === currentConversationId);
                    const failedUserMessage = updatedConv?.messages.find(m => m.id === userMessage.id);
                    
                    if (failedUserMessage) {
                      // Save ONLY the user message with error details (no assistant error message)
                      await fetch("/api/chat/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          message: failedUserMessage, // Single message, not array
                          sessionId: currentConversationId,
                        }),
                      });
                      logger.debug("Failed user message saved to database", { 
                        userMessageId: failedUserMessage.id,
                        userInputTokens: failedUserMessage.input_tokens,
                        errorMessage: failedUserMessage.error_message
                      });
                    }
                  } catch (saveError) {
                    logger.debug("Failed message save failed", saveError);
                  }
                }, 100);
              }
            }
          },

          updateConversationTitle: async (id, title, isAutoGenerated = false) => {
            logger.debug("Updating conversation title", { id, title, isAutoGenerated });
            
            // Get conversation data before state update to avoid timing issues
            const { user } = useAuthStore.getState();
            const conversation = get().conversations.find(c => c.id === id);
            
            // Update local state immediately for optimistic UI
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === id
                  ? { ...conv, title, updatedAt: new Date().toISOString() }
                  : conv
              ),
            }));

            // Update session title on server for authenticated users
            // For auto-generated titles during message flow, we'll handle this in the message endpoint
            // Only use the session endpoint for explicit manual title updates (e.g., from ChatSidebar)
            if (user?.id && conversation?.userId === user.id && !isAutoGenerated) {
              logger.debug("Updating session title on server via session endpoint", { 
                conversationId: id, 
                newTitle: title 
              });
              
              try {
                const response = await fetch("/api/chat/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: id,
                    title: title,
                  }),
                });

                if (!response.ok) {
                  throw new Error(`Failed to update session title: ${response.statusText}`);
                }

                const result = await response.json();
                logger.debug("Session title updated successfully", { 
                  sessionId: result.session?.id,
                  updatedTitle: result.session?.title 
                });
              } catch (error) {
                logger.error("Failed to update session title on server", { 
                  error, 
                  conversationId: id, 
                  title 
                });
                // Note: Local state already updated optimistically, so UI shows the change
                // Could add error handling/retry logic here if needed
              }
            }
          },

          deleteConversation: async (id) => {
            const { user } = useAuthStore.getState();
            
            logger.debug("Deleting conversation", { id, authenticated: !!user });
            
            try {
              // If user is authenticated, delete from backend first
              if (user) {
                logger.debug("Deleting conversation from server for authenticated user");
                const response = await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, {
                  method: 'DELETE',
                });

                if (!response.ok) {
                  throw new Error(`Failed to delete conversation: ${response.statusText}`);
                }

                const result = await response.json();
                logger.debug("Server conversation deleted", result);
              }

              // Delete from local store
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

              logger.debug("Conversation deleted successfully", { id });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation';
              logger.error("Failed to delete conversation", errorMessage);
              
              set({ 
                error: { 
                  message: errorMessage, 
                  timestamp: new Date().toISOString() 
                }
              });
              throw error; // Re-throw for UI handling
            }
          },

          clearAllConversations: async () => {
            const { user } = useAuthStore.getState();
            
            logger.debug("Clearing all conversations");

            try {
              // If user is authenticated, also clear from Supabase
              if (user) {
                logger.debug("Clearing all conversations from server for authenticated user");
                const response = await fetch('/api/chat/clear-all', {
                  method: 'DELETE',
                });

                if (!response.ok) {
                  throw new Error(`Failed to clear server conversations: ${response.statusText}`);
                }

                const result = await response.json();
                logger.debug("Server conversations cleared", result);
              }

              // Clear all conversations from local store
              set({
                conversations: [],
                currentConversationId: null,
                error: null,
              });

              logger.debug("All conversations cleared successfully");
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to clear conversations';
              logger.error("Failed to clear all conversations", errorMessage);
              
              set({ 
                error: { 
                  message: errorMessage, 
                  timestamp: new Date().toISOString() 
                }
              });
              throw error;
            }
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

          // Ephemeral banner controls (client-session only)
          setConversationErrorBanner: (conversationId, banner) => {
            set((state) => ({
              conversationErrorBanners: {
                ...state.conversationErrorBanners,
                [conversationId]: banner,
              },
            }));
          },
          clearConversationErrorBanner: (conversationId) => {
            set((state) => {
              const next = { ...state.conversationErrorBanners } as Record<string, typeof state.conversationErrorBanners[string]>;
              delete next[conversationId];
              return { conversationErrorBanners: next };
            });
          },
          clearAllConversationErrorBanners: () => {
            set({ conversationErrorBanners: {} });
          },

          // When a user manually dismisses the error banner, disable retry for that failed message
          closeErrorBannerAndDisableRetry: (conversationId: string) => {
            const { conversationErrorBanners } = get();
            const banner = conversationErrorBanners[conversationId];
            // Clear the banner first
            get().clearConversationErrorBanner(conversationId);
            if (!banner) return;

            // Flip retry_available to false on the referenced user message
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === conversationId
                  ? {
                      ...conv,
                      messages: conv.messages.map((m) =>
                        m.id === banner.messageId && m.role === 'user'
                          ? { ...m, retry_available: false }
                          : m
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

            // Find the last failed user message (with error flag)
            const lastFailedMessage = currentConversation.messages
              .slice()
              .reverse()
              .find((msg) => msg.role === "user" && msg.error);

            if (!lastFailedMessage) {
              logger.warn("No failed user message found to retry");
              return;
            }

            // If user manually dismissed the banner earlier, do not allow retry
            if (lastFailedMessage.retry_available === false) {
              logger.debug('Retry disabled for this message due to manual dismissal');
              return;
            }

            // Get the model to use for retry (priority: originalModel > conversation lastModel > fallback)
            const modelToUse = lastFailedMessage.originalModel ||
                              currentConversation.lastModel ||
                              undefined; // Let sendMessage handle default

            logger.debug("Retrying failed message", {
              messageId: lastFailedMessage.id,
              content: lastFailedMessage.content.substring(0, 50) + "...",
              modelToUse
            });
            
            // Clear global error; keep message.error for history. Dismiss conversation banner on retry.
            get().clearError();
            const convId = get().currentConversationId;
            if (convId) {
              get().clearConversationErrorBanner(convId);
            }
            
            // Retry the message with the original model
            // This will reuse the existing message instead of creating a new one
            await get().retryMessage(lastFailedMessage.id, lastFailedMessage.content, modelToUse);
          },

          // New function to retry a specific message without creating duplicates
          retryMessage: async (
            messageId: string,
            content: string,
            model?: string,
            options?: { attachmentIds?: string[]; webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' }; imageOutput?: boolean }
          ) => {
            if (!content.trim() || get().isLoading) {
              logger.warn("Cannot retry message: empty content or already loading");
              return;
            }

            const { currentConversationId } = get();
            if (!currentConversationId) return;

            logger.debug("Retrying specific message", { messageId, model });

            // Capture retry start time BEFORE building context so ordering uses the new timestamp
            const retryStartedAt = new Date();

            // Set loading state (do not clear banners globally)
            set({ isLoading: true, error: null });

            // Update the existing user message timestamp to reflect this new retry attempt
            set((state) => ({
              conversations: state.conversations.map(conv =>
                conv.id === currentConversationId
                  ? {
                      ...conv,
                      messages: conv.messages.map(msg =>
                        msg.id === messageId && msg.role === 'user'
                          ? { ...msg, timestamp: retryStartedAt }
                          : msg
                      )
                    }
                  : conv
              )
            }));

            try {
              // Phase 3: Check if context-aware mode is enabled
              const isContextAwareEnabled = process.env.NEXT_PUBLIC_ENABLE_CONTEXT_AWARE === 'true';
              
              logger.debug(`[Retry Message] Context-aware mode: ${isContextAwareEnabled ? 'ENABLED' : 'DISABLED'}`);
              logger.debug(`[Retry Message] Model: ${model || 'default'}`);

              let requestBody: { message: string; model?: string; messages?: ChatMessage[]; current_message_id?: string; attachmentIds?: string[]; webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' }; imageOutput?: boolean };

              if (isContextAwareEnabled) {
                // Phase 3: Get model-specific token limits and select context
                const strategy = await getModelTokenLimits(model);
                logger.debug(`[Retry Message] Token strategy - Input: ${strategy.maxInputTokens}, Output: ${strategy.maxOutputTokens}`);

                // Get context messages within token budget (excluding the message being retried)
                const contextMessagesRaw = get().getContextMessages(strategy.maxInputTokens)
                  .filter(msg => msg.id !== messageId); // Exclude the message being retried
                const contextMessages = contextMessagesRaw.filter(m => {
                  if (m.role === 'user' && m.error) return false;
                  if (m.role === 'assistant' && m.user_message_id) {
                    const linked = contextMessagesRaw.find(x => x.id === m.user_message_id);
                    if (linked?.error) return false;
                  }
                  return true;
                });
                
                // Create a temporary message for the retry (not added to store yet)
                const retryMessage: ChatMessage = {
                  id: messageId, // Reuse the same ID
                  content: content.trim(),
                  role: "user",
                  timestamp: retryStartedAt,
                  originalModel: model,
                  // Store that this retry is using non-streaming mode
                  was_streaming: false,
                  requested_image_output: options?.imageOutput || false,
                };
                
                // Build complete message array (context + retry message)
                const allMessages = [...contextMessages, retryMessage];
                
                // Calculate total token usage
                const totalTokens = estimateMessagesTokens(allMessages);
                logger.debug(`[Retry Message] Total message tokens: ${totalTokens}/${strategy.maxInputTokens}`);
                
                // Validate budget with fallback logic (same as sendMessage)
                if (!isWithinInputBudget(totalTokens, strategy)) {
                  logger.debug(`[Retry Message] Token budget exceeded, falling back to progressive reduction`);
                  
                  const fallbackSizes = [
                    Math.floor(strategy.maxInputTokens * 0.8),
                    Math.floor(strategy.maxInputTokens * 0.6),
                    Math.floor(strategy.maxInputTokens * 0.4),
                    Math.floor(strategy.maxInputTokens * 0.2),
                    estimateTokenCount(retryMessage.content) + 20
                  ];
                  
                  let finalContextMessages = contextMessages;
                  for (const fallbackSize of fallbackSizes) {
                    const reducedContext = get().getContextMessages(fallbackSize)
                      .filter(msg => msg.id !== messageId);
                    const reducedTotal = estimateMessagesTokens([...reducedContext, retryMessage]);
                    
                    if (reducedTotal <= strategy.maxInputTokens) {
                      finalContextMessages = reducedContext;
                      logger.debug(`[Retry Message] Using fallback context: ${reducedContext.length} messages, ${reducedTotal} tokens`);
                      break;
                    }
                  }
                  
                  requestBody = {
                    message: content,
                    messages: [...finalContextMessages, retryMessage],
                    current_message_id: messageId,
                    attachmentIds: options?.attachmentIds,
                    webSearch: options?.webSearch,
                    webMaxResults: options?.webMaxResults,
                    reasoning: options?.reasoning,
                    imageOutput: !!options?.imageOutput,
                  };
                } else {
                  requestBody = {
                    message: content,
                    messages: allMessages,
                    current_message_id: messageId,
                    attachmentIds: options?.attachmentIds,
                    webSearch: options?.webSearch,
                    webMaxResults: options?.webMaxResults,
                    reasoning: options?.reasoning,
                    imageOutput: !!options?.imageOutput,
                  };
                }
                
                if (model) {
                  requestBody.model = model;
                }
                
                logger.debug(`[Retry Message] Sending NEW format with ${requestBody.messages?.length || 0} messages`);
              } else {
                // Legacy format
                requestBody = { message: content, current_message_id: messageId, imageOutput: !!options?.imageOutput };
                if (model) {
                  requestBody.model = model;
                }
                logger.debug(`[Retry Message] Sending LEGACY format (single message)`);
              }

              if (requestBody.messages) {
                const toMillis = (t: Date | string | undefined) => {
                  if (!t) return 0;
                  return t instanceof Date ? t.getTime() : new Date(t).getTime();
                };
                requestBody.messages = [...requestBody.messages]
                  .sort((a, b) => toMillis(a.timestamp as Date | string | undefined) - toMillis(b.timestamp as Date | string | undefined));
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
          upstreamErrorCode: errorData.upstreamErrorCode,
          upstreamErrorMessage: errorData.upstreamErrorMessage,
                  suggestions: errorData.suggestions,
                  retryAfter: errorData.retryAfter,
                  timestamp: errorData.timestamp ?? new Date().toISOString(),
                };
                // Anonymous error emit on retry
                try {
                  const { user } = useAuthStore.getState();
                  if (!user?.id) {
                    emitAnonymousError({
                      timestamp: new Date().toISOString(),
                      model: String(model || ''),
                      http_status: response.status,
                      error_code: typeof errorData.code === 'string' ? errorData.code : undefined,
                      error_message: typeof errorData.error === 'string' ? errorData.error : `HTTP ${response.status}`,
                      provider: typeof errorData.upstreamProvider === 'string' ? errorData.upstreamProvider : undefined,
                      provider_request_id: typeof errorData.upstreamProviderRequestId === 'string' ? errorData.upstreamProviderRequestId : undefined,
                      metadata: {
                        streaming: false,
                        retry: true,
                        ...(errorData.upstreamErrorCode !== undefined ? { upstreamErrorCode: errorData.upstreamErrorCode } : {}),
                        ...(errorData.upstreamErrorMessage ? { upstreamErrorMessage: errorData.upstreamErrorMessage } : {}),
                        ...(response.headers.get('x-request-id') ? { api_request_id: response.headers.get('x-request-id') as string } : {}),
                      },
                    });
                  }
                } catch {}
                throw chatError;
              }

              // Handle backend response
              const raw = await response.json();
              const data = raw.data ?? raw;

              if (data.error) {
                throw new Error(data.error);
              }

              type ChatResponseWithReasoning2 = {
                reasoning?: string;
                reasoning_details?: Record<string, unknown>[];
              };
              const respWithReasoning2 = data as ChatResponseWithReasoning2;
              
              // Apply provider-aware token correction (OpenAI image models need recalculation)
              const { correctTokensForProvider } = await import('../lib/utils/tokenCalculations');
              const correctedTokens = correctTokensForProvider(
                {
                  prompt_tokens: data.usage?.prompt_tokens,
                  completion_tokens: data.usage?.completion_tokens,
                  total_tokens: data.usage?.total_tokens,
                  completion_tokens_details: data.usage?.completion_tokens_details
                },
                data.model || model
              );
              
              const assistantMessage: ChatMessage = {
                id: generateMessageId(),
                content: data.response,
                role: "assistant",
                // Use server-provided timestamp if available for consistency
                timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
                elapsed_ms: data.elapsed_ms ?? 0,
                total_tokens: correctedTokens.total_tokens,
                input_tokens: correctedTokens.input_tokens,
                output_tokens: correctedTokens.output_tokens,
                // Extract image tokens from corrected tokens
                ...(correctedTokens.output_image_tokens && {
                  output_image_tokens: correctedTokens.output_image_tokens
                }),
                user_message_id: data.request_id, // Link to the user message that triggered this response
                model: data.model || model,
                contentType: data.contentType || "text",
                completion_id: data.id,
                // Mark assistant as non-streaming in retry non-streaming path
                was_streaming: false,
                has_websearch: !!data.has_websearch,
                websearch_result_count: typeof data.websearch_result_count === 'number' ? data.websearch_result_count : undefined,
                annotations: Array.isArray(data.annotations) ? data.annotations : undefined,
                reasoning: typeof respWithReasoning2.reasoning === 'string' ? respWithReasoning2.reasoning : undefined,
                reasoning_details: respWithReasoning2.reasoning_details && Array.isArray(respWithReasoning2.reasoning_details) ? respWithReasoning2.reasoning_details : undefined,
              };

              // Update the conversation: clear error on retried message and add assistant response
              // Also update the user message with input tokens if we have a request_id
              set((state) => {
                const currentConv = state.conversations.find(c => c.id === state.currentConversationId);
                
                // Validation: Check if request_id matches any user message
                if (data.request_id && currentConv) {
                  const matchingUserMessage = currentConv.messages.find(m => m.id === data.request_id && m.role === 'user');
                  if (matchingUserMessage) {
                    logger.debug("Updating user message with input tokens (retry)", { 
                      messageId: data.request_id, 
                      inputTokens: data.usage?.prompt_tokens,
                      messageContent: matchingUserMessage.content.substring(0, 50) + "..."
                    });
                  } else {
                    logger.warn("Warning: request_id not found in user messages (retry)", { 
                      requestId: data.request_id,
                      availableUserMessages: currentConv.messages.filter(m => m.role === 'user').map(m => ({ id: m.id, content: m.content.substring(0, 30) + "..." }))
                    });
                  }
                }

                return {
                  conversations: state.conversations.map((conv) =>
                    conv.id === state.currentConversationId
                      ? updateConversationFromMessages({
                          ...conv,
                          messages: [
                            ...conv.messages.map((msg) => {
                              if (msg.id === messageId && msg.role === 'user') {
                                // Successful retry: clear error & apply new tokens, PRESERVE original timestamp
                                return {
                                  ...msg,
                                  error: false,
                                  error_message: undefined,
                                  error_code: undefined,
                                  retry_after: undefined,
                                  input_tokens: data.usage?.prompt_tokens ?? 0,
                                };
                              }
                              // Fallback path (should normally not hit when messageId === data.request_id). Only update tokens.
                              if (msg.id === data.request_id && msg.role === 'user') {
                                return {
                                  ...msg,
                                  input_tokens: data.usage?.prompt_tokens ?? 0,
                                };
                              }
                              return msg;
                            }),
                            assistantMessage // Add the assistant response
                          ],
                        })
                      : conv
                  ),
                  isLoading: false,
                };
              });

              // Anonymous usage emit on retry success (best-effort)
              try {
                const { user } = useAuthStore.getState();
                if (!user?.id) {
                  emitAnonymousUsage([
                    { timestamp: new Date().toISOString(), type: 'message_sent', model },
                    {
                      timestamp: new Date().toISOString(),
                      type: 'completion_received',
                      model: assistantMessage.model,
                      input_tokens: (data.usage?.prompt_tokens ?? 0),
                      output_tokens: assistantMessage.output_tokens,
                      elapsed_ms: assistantMessage.elapsed_ms,
                    },
                  ]);
                }
              } catch {}

              // Auto-generate title from first user message if conversation was 'New Chat'
              const currentConvAfterRetry = get().conversations.find(c => c.id === currentConversationId);
              if (currentConvAfterRetry && currentConvAfterRetry.title === "New Chat" && currentConvAfterRetry.messages.length === 2) {
                const autoTitle = content.length > 50 ? content.substring(0, 50) + "..." : content;
                get().updateConversationTitle(currentConversationId, autoTitle, true);
              }

              logger.debug("Message retry successful", { messageId, conversationId: currentConversationId });

              // Persist retried user + assistant pair (reuse ID) for authenticated users
              const { user } = useAuthStore.getState();
              if (user?.id) {
                setTimeout(async () => {
                  try {
                    const updatedConv = get().conversations.find(c => c.id === currentConversationId);
                    const retriedUserMessage = updatedConv?.messages.find(m => m.id === messageId && m.role === 'user');
                    if (retriedUserMessage) {
                      // Ensure persistence includes updated tokens & timestamp (Upsert on backend)
                      const saveUserMsg = {
                        ...retriedUserMessage,
                        error: false,
                        error_message: undefined,
                        error_code: undefined,
                        retry_after: undefined,
                        // Guarantee tokens present (preserve original timestamp from initial send, not response time)
                        input_tokens: retriedUserMessage.input_tokens ?? data.usage?.prompt_tokens ?? 0,
                      };

                      const shouldIncludeTitle = updatedConv &&
                        updatedConv.title !== "New Chat" &&
                        updatedConv.messages.length === 2;

                      const payload: {
                        messages: ChatMessage[];
                        sessionId: string;
                        sessionTitle?: string;
                      } = {
                        messages: [saveUserMsg, assistantMessage],
                        sessionId: currentConversationId,
                      };

                      if (shouldIncludeTitle) {
                        payload.sessionTitle = updatedConv?.title;
                      }

                      await fetch('/api/chat/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                      });
                      // Update lastSyncTime after successful persistence (retry path)
                      set({ lastSyncTime: new Date().toISOString(), syncError: null });
                      toast.success('Message saved successfully!', { id: 'chat-message-saved' });
                      logger.debug('Retry message pair saved', { userMessageId: retriedUserMessage.id, assistantId: assistantMessage.id });
                    }
                  } catch (e) {
                    logger.debug('Retry message save failed (silent)', e);
                  }
                }, 80);
              }

            } catch (err) {
              let chatError: ChatError;
              
              if (typeof err === 'object' && err !== null && 'code' in err && typeof (err as ChatError).code === 'string') {
                chatError = err as ChatError;
              } else {
                const errorMessage = err instanceof Error ? err.message : "An error occurred";
                chatError = {
                  message: errorMessage,
                  code: (errorMessage.includes("fetch") || errorMessage.includes("Network")) ? "network_error" : "unknown_error",
                };
              }

              logger.error("Failed to retry message", { error: chatError, messageId });

              // Mark the message as failed again and set error state
              set((state) => ({
                conversations: state.conversations.map((conv) =>
                  conv.id === state.currentConversationId
                    ? {
                        ...conv,
                        messages: conv.messages.map((msg) =>
                          msg.id === messageId
                            ? { 
                                ...msg, 
                                error: true, 
                                input_tokens: 0, // Ensure input_tokens is 0 for failed retry
                                error_message: chatError.message, // Map error_message to user message
                                error_code: chatError.code,
                                upstream_error_code: chatError.upstreamErrorCode,
                                upstream_error_message: chatError.upstreamErrorMessage,
                                retry_after: chatError.retryAfter,
                                retry_available: true,
                              }
                            : msg
                        ),
                      }
                    : conv
                ),
                isLoading: false,
                error: chatError,
              }));

              // Set ephemeral banner on retry failure as well
              const convId2 = get().currentConversationId;
              if (convId2) {
                get().setConversationErrorBanner(convId2, {
                  messageId,
                  message: chatError.message,
                  code: chatError.code,
                  retryAfter: chatError.retryAfter,
                  createdAt: new Date().toISOString(),
                });
              }
            }
          },

          // Sync actions
          syncConversations: async () => {
            const { conversations } = get();
            const { user } = useAuthStore.getState();
            
            if (!user) {
              logger.debug("No authenticated user, skipping sync");
              return;
            }

            // Use global sync manager to prevent multiple concurrent syncs
            if (!syncManager.startSync()) {
              return; // Sync was blocked by the manager
            }

            // Filter conversations that belong to the current user
            const userConversations = conversations.filter(conv => conv.userId === user.id);
            
            if (userConversations.length === 0) {
              logger.debug("No user conversations to sync");
              syncManager.endSync();
              return;
            }

            set({ isSyncing: true, syncError: null });

            try {
              logger.debug("Syncing conversations to server", { count: userConversations.length });
              
              // Log sample message metadata for verification
              const sampleMessage = userConversations[0]?.messages.find(m => m.role === 'assistant');
              if (sampleMessage) {
                logger.debug("Sample assistant message metadata", {
                  hasContentType: !!sampleMessage.contentType,
                  hasElapsedTime: !!sampleMessage.elapsed_ms,
                  hasCompletionId: !!sampleMessage.completion_id,
                  hasTotalTokens: !!sampleMessage.total_tokens
                });
              }
              
              const response = await fetch('/api/chat/sync', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ conversations: userConversations })
              });

              if (!response.ok) {
                throw new Error(`Sync failed: ${response.statusText}`);
              }

              const result = await response.json();
              
              set({ 
                isSyncing: false, 
                lastSyncTime: result.syncTime,
                syncError: null 
              });
              
              logger.debug("Sync completed successfully", result.results);
              
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Sync failed';
              logger.error("Sync failed", errorMessage);
              
              set({ 
                isSyncing: false, 
                syncError: errorMessage 
              });
            } finally {
              // Always clear the sync in progress flag
              set({ syncInProgress: false });
              syncManager.endSync();
            }
          },

          loadUserConversations: async (userId: string) => {
            const { isLoading } = get();
            
            // Prevent multiple concurrent loads
            if (isLoading) {
              logger.debug("Load already in progress, skipping");
              return;
            }

            set({ isLoading: true, error: null });

            try {
              logger.debug("Loading user conversations from server", { userId });
              
              // Request summary mode for lean sidebar payload with pagination meta
              const response = await fetch('/api/chat/sync?limit=20&summary_only=true');
              
              if (!response.ok) {
                throw new Error(`Failed to load conversations: ${response.statusText}`);
              }

              const result = await response.json();
              const serverConversations = result.conversations || [];
              const meta = result.meta as { hasMore?: boolean; nextCursor?: { ts: string; id: string } | null; pageSize?: number } | undefined;
              
              // Log sample message metadata for verification
              const sampleMessage = serverConversations[0]?.messages?.find((m: ChatMessage) => m.role === 'assistant');
              if (sampleMessage) {
                logger.debug("Sample loaded assistant message metadata", {
                  hasContentType: !!sampleMessage.contentType,
                  hasElapsedTime: !!sampleMessage.elapsed_ms,
                  hasCompletionId: !!sampleMessage.completion_id,
                  hasTotalTokens: !!sampleMessage.total_tokens
                });
              }
              
              // Reset top page strictly to server list, preserving messages for any matching cached conversations
              set((state) => {
                const localById = new Map<string, Conversation>();
                for (const conv of state.conversations) localById.set(conv.id, conv);

                const updatedTop: Conversation[] = (serverConversations as Conversation[]).map((serverConv) => {
                  const local = localById.get(serverConv.id);
                  if (local && Array.isArray(local.messages) && local.messages.length > 0) {
                    // Preserve cached messages and recompute counters/lasts
                    return updateConversationFromMessages({ ...serverConv, messages: local.messages });
                  }
                  // Ensure messages array exists
                  return { ...serverConv, messages: Array.isArray(serverConv.messages) ? serverConv.messages : [] } as Conversation;
                });

                // Keep other local conversations (not in top page) so they can appear after loading more
                const serverIds = new Set(updatedTop.map(c => c.id));
                const others = state.conversations.filter(c => !serverIds.has(c.id));

                const merged = [...updatedTop, ...others].sort(sortByLastTimestampDesc);

                return {
                  conversations: merged,
                  isLoading: false,
                  lastSyncTime: result.syncTime,
                  sidebarPaging: {
                    pageSize: meta?.pageSize ?? 20,
                    loading: false,
                    hasMore: !!meta?.hasMore,
                    nextCursor: meta?.nextCursor ?? null,
                    initialized: true,
                  }
                };
              });
              
              logger.debug("User conversations loaded successfully", { count: serverConversations.length });
              
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to load conversations';
              logger.error("Failed to load user conversations", errorMessage);
              
              set({ 
                isLoading: false, 
                error: { message: errorMessage, timestamp: new Date().toISOString() }
              });
            }
          },

          // New: load more for sidebar pagination
          loadInitialConversations: async () => {
            const paging = get().sidebarPaging;
            if (paging?.loading) return;
            set({ sidebarPaging: { ...(paging || { pageSize: 20 }), loading: true, initialized: paging?.initialized ?? false, hasMore: paging?.hasMore ?? false, nextCursor: paging?.nextCursor ?? null } });
            try {
              const response = await fetch(`/api/chat/sync?limit=${(paging?.pageSize ?? 20)}&summary_only=true`);
              if (!response.ok) throw new Error(`Failed to load conversations: ${response.statusText}`);
              const result = await response.json();
              const serverConversations = result.conversations || [];
              const meta = result.meta as { hasMore?: boolean; nextCursor?: { ts: string; id: string } | null; pageSize?: number } | undefined;
              set((state) => {
                const localById = new Map<string, Conversation>();
                for (const conv of state.conversations) localById.set(conv.id, conv);
                const updatedTop: Conversation[] = (serverConversations as Conversation[]).map((serverConv) => {
                  const local = localById.get(serverConv.id);
                  if (local && Array.isArray(local.messages) && local.messages.length > 0) {
                    return updateConversationFromMessages({ ...serverConv, messages: local.messages });
                  }
                  return { ...serverConv, messages: Array.isArray(serverConv.messages) ? serverConv.messages : [] } as Conversation;
                });
                const serverIds = new Set(updatedTop.map(c => c.id));
                const others = state.conversations.filter(c => !serverIds.has(c.id));
                const merged = [...updatedTop, ...others].sort(sortByLastTimestampDesc);
                return {
                  conversations: merged,
                  sidebarPaging: {
                    pageSize: meta?.pageSize ?? (paging?.pageSize ?? 20),
                    loading: false,
                    hasMore: !!meta?.hasMore,
                    nextCursor: meta?.nextCursor ?? null,
                    initialized: true,
                  },
                  lastSyncTime: result.syncTime,
                };
              });
            } catch (e) {
              const fallback = paging || { pageSize: 20, hasMore: false, nextCursor: null, initialized: false, loading: false };
              set({ sidebarPaging: { ...fallback, loading: false } });
              throw e;
            }
          },

          loadMoreConversations: async () => {
            const paging = get().sidebarPaging;
            if (!paging?.hasMore || paging.loading) return;
            set({ sidebarPaging: { ...paging, loading: true } });
            try {
              const params = new URLSearchParams();
              params.set('limit', String(paging.pageSize));
              params.set('summary_only', 'true');
              if (paging.nextCursor) {
                params.set('cursor_ts', paging.nextCursor.ts);
                params.set('cursor_id', paging.nextCursor.id);
              }
              const response = await fetch(`/api/chat/sync?${params.toString()}`);
              if (!response.ok) throw new Error(`Failed to load more conversations: ${response.statusText}`);
              const result = await response.json();
              const serverConversations = result.conversations || [];
              const meta = result.meta as { hasMore?: boolean; nextCursor?: { ts: string; id: string } | null } | undefined;
              set((state) => {
                const byId = new Map<string, Conversation>();
                for (const conv of state.conversations) byId.set(conv.id, conv);
                for (const conv of serverConversations as Conversation[]) byId.set(conv.id, conv);
                const allConversations = Array.from(byId.values()).sort(sortByLastTimestampDesc);
                return {
                  conversations: allConversations,
                  sidebarPaging: {
                    ...state.sidebarPaging!,
                    loading: false,
                    hasMore: !!meta?.hasMore,
                    nextCursor: meta?.nextCursor ?? null,
                  }
                };
              });
            } catch (e) {
              set({ sidebarPaging: { ...(paging || { pageSize: 20, hasMore: false, nextCursor: null, initialized: false, loading: false }), loading: false } });
              throw e;
            }
          },

          // Lazy loader: fetch or revalidate messages for a session and merge into store
          loadConversationMessages: async (id: string) => {
            const existing = get().conversations.find(c => c.id === id);
            if (!existing) return;

            if (messagesInflight.has(id)) {
              logger.debug('Message load already in-flight, skipping', { id });
              return;
            }

            messagesInflight.add(id);
            const hasExistingMessages = Array.isArray(existing.messages) && existing.messages.length > 0;

            // Only toggle global isLoading when performing a full initial fetch
            if (!hasExistingMessages) set({ isLoading: true });

            try {
              let url = `/api/chat/messages?session_id=${encodeURIComponent(id)}`;
              let lastTsIso: string | null = null;
              if (hasExistingMessages) {
                const last = existing.messages[existing.messages.length - 1];
                const ts = typeof last.timestamp === 'string' ? new Date(last.timestamp) : last.timestamp as Date;
                lastTsIso = ts.toISOString();
                url += `&since_ts=${encodeURIComponent(lastTsIso)}`;
              }

              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to load messages: ${res.statusText}`);
              const data = await res.json();
              const newMsgs: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];

              if (hasExistingMessages) {
                if (newMsgs.length === 0) {
                  // No changes; nothing to update
                  return;
                }
                // Append strictly newer messages
                set((state) => {
                  const conv = state.conversations.find(c => c.id === id)!;
                  const combined = [...conv.messages];
                  for (const m of newMsgs) {
                    if (!combined.some(x => x.id === m.id)) combined.push(m);
                  }
                  const updated = updateConversationFromMessages({ ...conv, messages: combined });
                  return {
                    conversations: state.conversations.map(c => c.id === id ? updated : c),
                  };
                });
              } else {
                // Initial full load
                const msgs = newMsgs;
                set((state) => ({
                  conversations: state.conversations.map(conv =>
                    conv.id === id
                      ? updateConversationFromMessages({ ...conv, messages: msgs })
                      : conv
                  ),
                  isLoading: false,
                }));
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Failed to load messages';
              logger.error('loadConversationMessages failed', message);
              set({ isLoading: false, error: { message, timestamp: new Date().toISOString() } });
              throw e;
            } finally {
              messagesInflight.delete(id);
            }
          },

          migrateAnonymousConversations: async (userId: string) => {
            const { conversations } = get();
            
            // Find anonymous conversations (no userId)
            const anonymousConversations = conversations.filter(conv => !conv.userId);
            
            if (anonymousConversations.length === 0) {
              logger.debug("No anonymous conversations to migrate");
              return;
            }

            logger.debug("Migrating anonymous conversations", { count: anonymousConversations.length });
            
            // Update conversations with userId in store
            set((state) => ({
              conversations: state.conversations.map(conv => 
                anonymousConversations.some(anon => anon.id === conv.id)
                  ? { ...conv, userId, updatedAt: new Date().toISOString() }
                  : conv
              )
            }));

            // Sync migrated conversations to server
            try {
              await get().syncConversations();
              logger.debug("Anonymous conversations migrated successfully");
            } catch (error) {
              logger.error("Failed to sync migrated conversations", error);
            }
          },

          filterConversationsByUser: (userId: string | null) => {
            const { conversations } = get();
            
            const filteredConversations = conversations.filter(conv => {
              if (!userId) {
                // Anonymous mode: show only conversations without userId
                return !conv.userId;
              } else {
                // Authenticated mode: show only current user's conversations
                return conv.userId === userId;
              }
            });

            // Find the current conversation in filtered list
            const { currentConversationId } = get();
            const isCurrentConversationVisible = filteredConversations.some(c => c.id === currentConversationId);
            
            set({
              conversations: [...filteredConversations].sort(sortByLastTimestampDesc),
              currentConversationId: isCurrentConversationVisible ? currentConversationId : null
            });
            
            logger.debug("Conversations filtered by user", { 
              userId, 
              count: filteredConversations.length 
            });
          },

          _hasHydrated: () => {
            set({ isHydrated: true });
          },

          // Search actions
          performLocalSearch: (query: string) => {
            const normalizedQuery = query.toLowerCase().trim();
            
            if (!normalizedQuery) {
              get().clearSearch();
              return;
            }

            const { conversations } = get();
            
            // Search through conversations
            const results = conversations.filter((conv) => {
              // Search in title (always available)
              if (conv.title.toLowerCase().includes(normalizedQuery)) {
                return true;
              }

              // Search in last message preview (always available, ~100 chars)
              if (conv.lastMessagePreview?.toLowerCase().includes(normalizedQuery)) {
                return true;
              }

              // Search in full message content (only if messages have been loaded)
              if (Array.isArray(conv.messages) && conv.messages.length > 0) {
                return conv.messages.some((msg) =>
                  msg.content.toLowerCase().includes(normalizedQuery)
                );
              }

              return false;
            });

            // Sort by relevance: title match > preview match > message content match
            results.sort((a, b) => {
              const aTitleMatch = a.title.toLowerCase().includes(normalizedQuery);
              const bTitleMatch = b.title.toLowerCase().includes(normalizedQuery);
              
              if (aTitleMatch && !bTitleMatch) return -1;
              if (!aTitleMatch && bTitleMatch) return 1;
              
              const aPreviewMatch = a.lastMessagePreview?.toLowerCase().includes(normalizedQuery);
              const bPreviewMatch = b.lastMessagePreview?.toLowerCase().includes(normalizedQuery);
              
              if (aPreviewMatch && !bPreviewMatch) return -1;
              if (!aPreviewMatch && bPreviewMatch) return 1;
              
              // If equal, maintain timestamp order
              return tsToMillis(b.lastMessageTimestamp || b.updatedAt || b.createdAt) -
                     tsToMillis(a.lastMessageTimestamp || a.updatedAt || a.createdAt);
            });

            set({
              searchQuery: query,
              searchMode: 'local',
              searchResults: results,
            });

            logger.debug("Local search completed", { 
              query, 
              resultsCount: results.length,
              totalConversations: conversations.length 
            });
          },

          clearSearch: () => {
            set({
              searchQuery: '',
              searchMode: 'inactive',
              searchResults: [],
              searchLoading: false,
              searchError: null,
            });
            logger.debug("Search cleared");
          },

          performServerSearch: async (query: string) => {
            const normalizedQuery = query.trim();
            
            if (!normalizedQuery || normalizedQuery.length < 2) {
              get().clearSearch();
              logger.warn("Server search requires at least 2 characters");
              return;
            }

            set({
              searchQuery: query,
              searchMode: 'server',
              searchLoading: true,
              searchError: null,
              searchResults: [],
            });

            try {
              logger.debug("Starting server search", { query: normalizedQuery });
              
              const params = new URLSearchParams({
                q: normalizedQuery,
                limit: '50',
              });

              const response = await fetch(`/api/chat/search?${params.toString()}`);
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                throw new Error(errorData.error || `Server search failed: ${response.status}`);
              }

              const data = await response.json();
              
              // Transform API results into Conversation objects
              // The API returns SearchResult[] with { id, title, lastMessagePreview, messageCount, lastMessageTimestamp, matchType, ... }
              const results: Conversation[] = (data.results || []).map((result: {
                id: string;
                title: string;
                lastMessagePreview?: string;
                messageCount: number;
                lastMessageTimestamp: string;
                matchType: 'title' | 'preview' | 'content';
                createdAt?: string;
                updatedAt?: string;
                totalTokens?: number;
                lastModel?: string;
                userId?: string;
              }) => ({
                id: result.id,
                title: result.title,
                messages: [], // Server search doesn't return full messages
                userId: result.userId,
                createdAt: result.createdAt || result.lastMessageTimestamp,
                updatedAt: result.updatedAt || result.lastMessageTimestamp,
                messageCount: result.messageCount,
                totalTokens: result.totalTokens || 0,
                lastModel: result.lastModel,
                isActive: false,
                lastMessagePreview: result.lastMessagePreview,
                lastMessageTimestamp: result.lastMessageTimestamp,
              }));

              set({
                searchResults: results,
                searchLoading: false,
                searchError: null,
              });

              logger.debug("Server search completed", { 
                query: normalizedQuery, 
                resultsCount: results.length,
                executionTimeMs: data.executionTimeMs 
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Server search failed';
              logger.error("Server search failed", { error: errorMessage, query: normalizedQuery });
              
              set({
                searchResults: [],
                searchLoading: false,
                searchError: errorMessage,
              });

              toast.error(`Search failed: ${errorMessage}`);
            }
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
            // Always present most-recent first by lastMessageTimestamp (with sensible fallbacks)
            return [...get().conversations]
              .sort(sortByLastTimestampDesc)
              .slice(0, limit);
          },
          // Ephemeral image retention enforcement (memory-only)
          enforceImageRetention: (conversationId: string) => {
            set((state) => {
              const conv = state.conversations.find(c => c.id === conversationId);
              if (!conv) return {} as unknown as Partial<ChatState>; // no update
              const limited = applyImageLimits(conv);
              if (limited === conv) return {} as unknown as Partial<ChatState>; // no change
              return {
                conversations: state.conversations.map(c => c.id === conversationId ? limited : c),
              };
            });
          },
        }),
        {
          name: STORAGE_KEYS.CHAT,
          storage: createJSONStorage(() => localStorage),
          partialize: (state) => ({
            // IMPORTANT: strip all output_images so large base64 blobs never hit localStorage
            conversations: stripAllImages(state.conversations),
            currentConversationId: state.currentConversationId,
            // Note: conversationErrorBanners intentionally NOT persisted (session-only)
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
