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
  // NEW: Real-time reasoning fields
  streamingReasoning: string;
  streamingReasoningDetails: Record<string, unknown>[];
  // NEW: Real-time annotations fields
  streamingAnnotations: Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>;
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
  
  // console.log('🔴 STREAMING HOOK: streamingEnabled =', streamingEnabled);
  
  // Force debug alert to check if streaming is working
  if (streamingEnabled) {
    // console.log('🟢 STREAMING IS ENABLED - checking further');
  } else {
    // console.log('🔴 STREAMING IS DISABLED - will use non-streaming path');
  }
  
  // Get user authentication for request context (used for authenticated features)
  useAuth();

  // Streaming-specific state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamError, setStreamError] = useState<ChatError | null>(null);
  // NEW: Real-time reasoning state
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingReasoningDetails, setStreamingReasoningDetails] = useState<Record<string, unknown>[]>([]);
  // NEW: Real-time annotations state
  const [streamingAnnotations, setStreamingAnnotations] = useState<Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>>([]);
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

    // logger.debug('Sending message with streaming:', {
    //   streaming: streamingEnabled,
    //   content: content.substring(0, 50) + "...",
    //   model,
    //   options
    // });

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
      // console.log('🟢 STREAMING PATH: Taking streaming path - should see more logs');
      // Alert to force visibility
      // console.log('🔴 ALERT: Streaming path activated!');
      
      // Streaming path
      setIsStreaming(true);
      setStreamingContent('');
      setStreamingReasoning(''); // NEW: Reset reasoning state
      setStreamingReasoningDetails([]); // NEW: Reset reasoning details state
      setStreamingAnnotations([]); // NEW: Reset annotations state
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
          reasoning_details?: Record<string, unknown>[];
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
              
              // Check for annotation chunks FIRST
              if (line.startsWith('__ANNOTATIONS_CHUNK__')) {
                try {
                  const annotationData = JSON.parse(line.replace('__ANNOTATIONS_CHUNK__', ''));
                  if (annotationData.type === 'annotations' && Array.isArray(annotationData.data)) {
                    setStreamingAnnotations(annotationData.data);
                    // logger.debug('🌐 Streaming annotation chunk received:', annotationData.data.length, 'annotations');
                    continue;
                  }
                } catch (error) {
                  logger.warn('Failed to parse annotation chunk:', error);
                  continue;
                }
              }
              
              // Check for reasoning chunk markers
              if (line.startsWith('__REASONING_CHUNK__')) {
                try {
                  const reasoningData = JSON.parse(line.replace('__REASONING_CHUNK__', ''));
                  if (reasoningData.type === 'reasoning') {
                    // ENHANCED: Only process reasoning chunks with actual content
                    if (reasoningData.data && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                      setStreamingReasoning(prev => prev + reasoningData.data);
                      // logger.debug('🧠 Streaming reasoning chunk received:', reasoningData.data.substring(0, 100) + '...');
                    } else {
                      // logger.debug('🧠 Skipping empty reasoning chunk');
                    }
                    continue; // Always continue - don't let empty chunks leak to content
                  }
                } catch (error) {
                  logger.warn('Failed to parse reasoning chunk:', error);
                  continue; // ENHANCED: Skip malformed chunks instead of processing as content
                }
              }
              
              // Check for reasoning details chunk markers
              // if (line.startsWith('__REASONING_DETAILS_CHUNK__')) {
              //   try {
              //     const reasoningDetailsData = JSON.parse(line.replace('__REASONING_DETAILS_CHUNK__', ''));
              //     if (reasoningDetailsData.type === 'reasoning_details') {
              //       // ENHANCED: Only process reasoning details with actual content
              //       if (reasoningDetailsData.data && Array.isArray(reasoningDetailsData.data) && reasoningDetailsData.data.length > 0) {
              //         setStreamingReasoningDetails(prev => [...prev, ...reasoningDetailsData.data]);
              //         logger.debug(`🧠 Streaming reasoning details chunk received: ${reasoningDetailsData.data.length} items`);
              //       } else {
              //         logger.debug('🧠 Skipping empty reasoning details chunk');
              //       }
              //       continue; // Always continue - don't let empty chunks leak to content
              //     }
              //   } catch (error) {
              //     logger.warn('Failed to parse reasoning details chunk:', error);
              //     continue; // ENHANCED: Skip malformed chunks instead of processing as content
              //   }
              // }

              // Check for metadata chunks with __METADATA__...__END__ format
              if (line.includes('__METADATA__') && line.includes('__END__')) {
                try {
                  const metadataMatch = line.match(/__METADATA__(.+?)__END__/);
                  if (metadataMatch) {
                    const metadataJson = JSON.parse(metadataMatch[1]);
                    if (metadataJson.type === 'metadata') {
                      finalMetadata = metadataJson.data;
                      // logger.debug('Received final metadata:', finalMetadata);
                      continue; // Skip adding to content
                    }
                  }
                } catch (error) {
                  logger.warn('Failed to parse metadata chunk:', error);
                }
              }
              
              // Check if this line contains final metadata (legacy format)
              try {
                const potentialJson = JSON.parse(line.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  // logger.debug('Received final metadata:', finalMetadata);
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
              // Check for metadata in buffer
              if (buffer.includes('__METADATA__') && buffer.includes('__END__')) {
                try {
                  const metadataMatch = buffer.match(/__METADATA__(.+?)__END__/);
                  if (metadataMatch) {
                    const metadataJson = JSON.parse(metadataMatch[1]);
                    if (metadataJson.type === 'metadata') {
                      finalMetadata = metadataJson.data;
                      // logger.debug('Received final metadata from buffer:', finalMetadata);
                    }
                  }
                } catch (error) {
                  logger.warn('Failed to parse metadata from buffer:', error);
                }
              } else {
                // Only add to content if it's not metadata JSON
                try {
                  const potentialJson = JSON.parse(buffer.trim());
                  if (potentialJson.__FINAL_METADATA__) {
                    finalMetadata = potentialJson.__FINAL_METADATA__;
                    // logger.debug('Received final metadata from buffer:', finalMetadata);
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
          // ENHANCED: Use streaming reasoning and annotations if available, fallback to metadata
          ...(streamingReasoning && { reasoning: streamingReasoning }),
          ...(finalMetadata?.reasoning && !streamingReasoning && { reasoning: finalMetadata.reasoning }),
          ...(streamingReasoningDetails.length > 0 && { reasoning_details: streamingReasoningDetails }),
          ...(finalMetadata?.reasoning_details && streamingReasoningDetails.length === 0 && { reasoning_details: finalMetadata.reasoning_details }),
          ...(streamingAnnotations.length > 0 && { annotations: streamingAnnotations }),
          ...(finalMetadata?.annotations && streamingAnnotations.length === 0 && Array.isArray(finalMetadata.annotations) && { annotations: finalMetadata.annotations }),
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

        // Auto-generate title from first user message if it's still "New Chat" (same logic as non-streaming)
        const currentConv = useChatStore.getState().conversations.find(c => c.id === conversationId);
        if (currentConv && currentConv.title === "New Chat" && currentConv.messages.length === 2) {
          const autoTitle = content.length > 50 ? content.substring(0, 50) + "..." : content;
          useChatStore.getState().updateConversationTitle(conversationId, autoTitle, true); // Mark as auto-generated
          // console.log('🟢 STREAMING TITLE: Auto-generated title from user message:', autoTitle);
        }

        // Trigger database sync (same format as non-streaming implementation)
        try {
          // Get the updated conversation state to check if we need to include title
          const currentState = useChatStore.getState();
          const updatedConv = currentState.conversations.find(c => c.id === conversationId);
          
          // Check if this is a newly titled conversation (first successful exchange)
          const shouldIncludeTitle = updatedConv && 
            updatedConv.title !== "New Chat" && 
            updatedConv.messages.length === 2;

          const syncPayload: {
            messages: [typeof updatedUserMessage, typeof assistantMessage];
            sessionId: string;
            sessionTitle?: string;
            attachmentIds?: string[];
          } = {
            messages: [updatedUserMessage, assistantMessage],
            sessionId: conversationId,
            ...(options?.attachmentIds && { attachmentIds: options.attachmentIds }),
          };

          // Include title for newly titled conversations
          if (shouldIncludeTitle) {
            syncPayload.sessionTitle = updatedConv?.title;
            // console.log('🟢 STREAMING SYNC: Including session title:', updatedConv?.title);
          } else {
            // console.log('🟡 STREAMING SYNC: No title needed:', {
            //   hasConv: !!updatedConv,
            //   title: updatedConv?.title,
            //   messageCount: updatedConv?.messages.length,
            //   shouldInclude: shouldIncludeTitle
            // });
          }

          const syncResponse = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(syncPayload),
          });

          if (!syncResponse.ok) {
            logger.warn('Failed to sync messages to database:', syncResponse.status);
          } else {
            // logger.debug('Messages synced to database successfully');
          }
        } catch (syncError) {
          logger.warn('Database sync failed:', syncError);
          // Don't fail the entire request if database sync fails
        }

        // logger.debug('Streaming completed successfully with metadata:', {
        //   contentLength: finalContent.length,
        //   tokens: finalMetadata?.usage,
        //   elapsed: finalMetadata?.elapsed_ms,
        //   contentType: finalMetadata?.contentType,
        //   hasReasoning: !!finalMetadata?.reasoning,
        //   annotationCount: finalMetadata?.annotations?.length || 0
        // });
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // logger.debug('Streaming request was aborted');
          return;
        }

        const chatError: ChatError = {
          message: error instanceof Error ? error.message : 'Streaming failed',
          code: 'stream_error',
          timestamp: new Date().toISOString(),
        };
        
        setStreamError(chatError);
        logger.error('Streaming error:', error);
        
        // Mark user message as failed (consistent with non-streaming error handling)
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === userMessage.id ? { 
                      ...msg, 
                      error: true,
                      input_tokens: 0, // Ensure input_tokens is 0 for failed request
                      error_message: chatError.message, // Map error_message to user message
                    } : msg
                  ),
                }
              : conv
          ),
          isLoading: false,
          error: chatError,
        }));
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning(''); // NEW: Reset reasoning state  
        setStreamingReasoningDetails([]); // NEW: Reset reasoning details state
        setStreamingAnnotations([]); // NEW: Reset annotations state
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
    streamingReasoning,
    streamingReasoningDetails,
    streamingAnnotations,
  ]);

  const clearMessages = useCallback(() => {
    clearCurrentMessages();
    setStreamingContent('');
    setStreamingReasoning(''); // NEW: Reset reasoning state
    setStreamingReasoningDetails([]); // NEW: Reset reasoning details state
    setStreamingAnnotations([]); // NEW: Reset annotations state
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
      streamingReasoning: '', // NEW
      streamingReasoningDetails: [], // NEW
      streamingAnnotations: [], // NEW
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
    streamingReasoning, // NEW
    streamingReasoningDetails, // NEW
    streamingAnnotations, // NEW
    error,
    sendMessage,
    clearMessages,
    clearError,
    clearMessageError,
    retryLastMessage,
  };
}
