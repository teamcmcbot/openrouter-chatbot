"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '../lib/types/chat';
import { useChatStore } from '../stores/useChatStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuth } from '../stores/useAuthStore';
import { createLogger } from '../stores/storeUtils';
import { checkRateLimitHeaders } from '../lib/utils/rateLimitNotifications';
import { getModelTokenLimits } from '../lib/utils/tokens';

const logger = createLogger("ChatStreaming");

interface ChatError {
  message: string;
  code?: string;
  suggestions?: string[];
  retryAfter?: number;
  timestamp?: string;
}

interface UseChatStreamingReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null;
  sendMessage: (content: string, model?: string, options?: { 
    attachmentIds?: string[]; 
    draftId?: string; 
    webSearch?: boolean; 
    reasoning?: { effort?: 'low' | 'medium' | 'high' } 
  }) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  clearMessageError: (messageId: string) => void;
  retryLastMessage: () => Promise<void>;
  // New streaming-specific methods
  isStreaming: boolean;
  streamingContent: string;
}

/**
 * Enhanced useChat hook that provides streaming capabilities while maintaining
 * backward compatibility with the existing Zustand store architecture
 */
export function useChatStreaming(): UseChatStreamingReturn {
  // Get existing store functions for compatibility
  const {
    getCurrentMessages,
    isLoading: storeIsLoading,
    error: storeError,
    clearCurrentMessages,
    clearError: storeClearError,
    clearMessageError: storeClearMessageError,
    currentConversationId,
    createConversation,
    getContextMessages,
    isHydrated,
  } = useChatStore();

  // Get user settings
  const settings = useSettingsStore();
  const streamingEnabled = Boolean(settings.getSetting('streamingEnabled', false));
  
  // Get user authentication for request context (used for authenticated features)
  useAuth();

  // Streaming-specific state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamError, setStreamError] = useState<ChatError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Enhanced sendMessage that uses streaming when enabled
  const sendMessage = useCallback(async (
    content: string, 
    model?: string, 
    options?: { 
      attachmentIds?: string[]; 
      draftId?: string; 
      webSearch?: boolean; 
      reasoning?: { effort?: 'low' | 'medium' | 'high' } 
    }
  ) => {
    if (!content.trim() || storeIsLoading || isStreaming) {
      logger.warn("Cannot send message: empty content or already loading");
      return;
    }

    // Ensure we have a conversation context
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = createConversation();
    }

    logger.debug('Sending message with streaming:', {
      streaming: streamingEnabled,
      content: content.substring(0, 50) + "...",
      model,
      options
    });

    // Create user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
      originalModel: model,
      has_attachments: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? true : undefined,
      attachment_ids: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? options!.attachmentIds : undefined,
    };

    if (streamingEnabled) {
      // Streaming path
      setIsStreaming(true);
      setStreamingContent('');
      setStreamError(null);
      
      // Add user message to store immediately
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: [...conv.messages, userMessage],
                updatedAt: new Date().toISOString(),
              }
            : conv
        ),
      }));

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Get conversation context
        const tokenStrategy = await getModelTokenLimits(model);
        const contextMessages = getContextMessages(tokenStrategy.maxInputTokens);
        
        // Build request body similar to existing implementation
        const requestBody = {
          messages: [...contextMessages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content,
            id: msg.id,
          })),
          model,
          current_message_id: userMessage.id,
          attachmentIds: options?.attachmentIds,
          draftId: options?.draftId,
          webSearch: options?.webSearch,
          reasoning: options?.reasoning,
        };

        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          // Handle rate limiting
          if (response.status === 429) {
            checkRateLimitHeaders(response);
          }

          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body received');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let finalMetadata: {
          response?: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          request_id?: string;
          timestamp?: string;
          elapsed_ms?: number;
          contentType?: "text" | "markdown";
          id?: string;
          reasoning?: string;
          reasoning_details?: Record<string, unknown>;
          annotations?: Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>;
          has_websearch?: boolean;
          websearch_result_count?: number;
        } | null = null;

        // Read the stream
        try {
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Look for complete JSON lines (ending with newline)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              // Check if this line contains final metadata
              try {
                const potentialJson = JSON.parse(line.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  logger.debug('Received final metadata:', finalMetadata);
                  // Don't break here - continue reading to ensure stream is complete
                  continue;
                }
              } catch {
                // Not JSON, treat as regular content
              }
              
              // Regular content - add to display
              fullContent += line + '\n';
              setStreamingContent(fullContent);
            }
            
            // Handle any remaining content in buffer (without newline)
            if (buffer && !finalMetadata) {
              // Only add to content if it's not metadata JSON
              try {
                const potentialJson = JSON.parse(buffer.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  logger.debug('Received final metadata from buffer:', finalMetadata);
                } else {
                  // Not metadata JSON, add as content
                  fullContent += buffer;
                  setStreamingContent(fullContent);
                }
              } catch {
                // Not JSON, add as regular content
                fullContent += buffer;
                setStreamingContent(fullContent);
              }
              buffer = '';
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Use final content from metadata if available, otherwise use accumulated content
        const finalContent = finalMetadata?.response || fullContent;
        
        // Create assistant message with metadata
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now() + 1}`,
          content: finalContent,
          role: "assistant",
          timestamp: new Date(),
          user_message_id: userMessage.id,
          model,
          contentType: finalMetadata?.contentType || "text",
          total_tokens: finalMetadata?.usage?.total_tokens || 0,
          input_tokens: finalMetadata?.usage?.prompt_tokens || 0,
          output_tokens: finalMetadata?.usage?.completion_tokens || 0,
          elapsed_ms: finalMetadata?.elapsed_ms || 0,
          completion_id: finalMetadata?.id,
          ...(finalMetadata?.reasoning && { reasoning: finalMetadata.reasoning }),
          ...(finalMetadata?.reasoning_details && { reasoning_details: finalMetadata.reasoning_details }),
          ...(finalMetadata?.annotations && Array.isArray(finalMetadata.annotations) && { annotations: finalMetadata.annotations }),
          ...(finalMetadata?.has_websearch !== undefined && { has_websearch: finalMetadata.has_websearch }),
          ...(finalMetadata?.websearch_result_count !== undefined && { websearch_result_count: finalMetadata.websearch_result_count }),
        };

        // Update user message with input tokens from metadata
        const updatedUserMessage = {
          ...userMessage,
          input_tokens: finalMetadata?.usage?.prompt_tokens || 0,
        };

        // Add both messages to store
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [
                    ...conv.messages.slice(0, -1), // Remove the temporary user message
                    updatedUserMessage, // Add updated user message with tokens
                    assistantMessage // Add assistant message
                  ],
                  updatedAt: new Date().toISOString(),
                }
              : conv
          ),
        }));

        // Trigger database sync (same format as non-streaming implementation)
        try {
          const syncResponse = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [updatedUserMessage, assistantMessage],
              sessionId: conversationId,
              ...(options?.attachmentIds && { attachmentIds: options.attachmentIds }),
            }),
          });

          if (!syncResponse.ok) {
            logger.warn('Failed to sync messages to database:', syncResponse.status);
          } else {
            logger.debug('Messages synced to database successfully');
          }
        } catch (syncError) {
          logger.warn('Database sync failed:', syncError);
          // Don't fail the entire request if database sync fails
        }

        logger.debug('Streaming completed successfully with metadata:', {
          contentLength: finalContent.length,
          tokens: finalMetadata?.usage,
          elapsed: finalMetadata?.elapsed_ms,
          contentType: finalMetadata?.contentType,
          hasReasoning: !!finalMetadata?.reasoning,
          annotationCount: finalMetadata?.annotations?.length || 0
        });
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.debug('Streaming request was aborted');
          return;
        }

        const chatError: ChatError = {
          message: error instanceof Error ? error.message : 'Streaming failed',
          code: 'stream_error',
          timestamp: new Date().toISOString(),
        };
        
        setStreamError(chatError);
        logger.error('Streaming error:', error);
        
        // Mark user message as failed
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === userMessage.id ? { ...msg, error: true } : msg
                  ),
                }
              : conv
          ),
        }));
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        abortControllerRef.current = null;
      }
    } else {
      // Non-streaming path - delegate to existing store implementation
      const storeSendMessage = useChatStore.getState().sendMessage;
      await storeSendMessage(content, model, options);
    }
  }, [
    streamingEnabled,
    storeIsLoading,
    isStreaming,
    currentConversationId,
    createConversation,
    getContextMessages,
  ]);

  const clearMessages = useCallback(() => {
    clearCurrentMessages();
    setStreamingContent('');
    setStreamError(null);
    storeClearError();
  }, [clearCurrentMessages, storeClearError]);

  const clearError = useCallback(() => {
    setStreamError(null);
    storeClearError();
  }, [storeClearError]);

  const clearMessageError = useCallback((messageId: string) => {
    storeClearMessageError(messageId);
  }, [storeClearMessageError]);

  const retryLastMessage = useCallback(async () => {
    const messages = getCurrentMessages();
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find(msg => msg.role === 'user');
      
    if (lastUserMessage) {
      await sendMessage(
        lastUserMessage.content,
        lastUserMessage.originalModel,
        {
          attachmentIds: lastUserMessage.attachment_ids,
          webSearch: lastUserMessage.has_websearch,
          // TODO: Extract reasoning from original message
        }
      );
    }
  }, [getCurrentMessages, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Don't return data until hydrated to prevent SSR mismatch
  if (!isHydrated) {
    return {
      messages: [],
      isLoading: false,
      isStreaming: false,
      streamingContent: '',
      error: null,
      sendMessage: async () => {},
      clearMessages: () => {},
      clearError: () => {},
      clearMessageError: () => {},
      retryLastMessage: async () => {},
    };
  }

  const messages = getCurrentMessages();
  const isLoading = storeIsLoading || isStreaming;
  const error = streamError || storeError;

  return {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    clearMessages,
    clearError,
    clearMessageError,
    retryLastMessage,
  };
}
