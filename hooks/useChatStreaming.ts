"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '../lib/types/chat';
import { useChatStore } from '../stores/useChatStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuth, useAuthStore } from '../stores/useAuthStore';
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
  webMaxResults?: number;
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
  // Local accumulator for annotations to dedupe across chunks by URL (case-insensitive)
  const annotationsMapRef = useRef<Map<string, { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>>(new Map());

  // Enhanced sendMessage that uses streaming when enabled
  const sendMessage = useCallback(async (
    content: string, 
    model?: string, 
    options?: { 
      attachmentIds?: string[]; 
      draftId?: string; 
      webSearch?: boolean; 
      webMaxResults?: number;
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
      // Store that this was sent in streaming mode
      was_streaming: true,
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
  annotationsMapRef.current = new Map(); // reset accumulator
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
          webMaxResults: options?.webMaxResults,
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
          model?: string;
          reasoning?: string;
          reasoning_details?: Record<string, unknown>[];
          annotations?: Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>;
          has_websearch?: boolean;
          websearch_result_count?: number;
        } | null = null;

        // Read the stream
        // Local accumulators to avoid relying on async state updates
        let reasoningAccum = '';
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
                    // Accumulate and dedupe by URL (case-insensitive)
                    for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                      if (!ann || typeof ann.url !== 'string') continue;
                      const key = ann.url.toLowerCase();
                      const existing = annotationsMapRef.current.get(key);
                      if (!existing) {
                        annotationsMapRef.current.set(key, { ...ann, type: 'url_citation' });
                      } else {
                        // Merge fields, prefer newer non-empty values
                        annotationsMapRef.current.set(key, {
                          type: 'url_citation',
                          url: existing.url || ann.url,
                          title: ann.title || existing.title,
                          content: ann.content || existing.content,
                          start_index: typeof ann.start_index === 'number' ? ann.start_index : existing.start_index,
                          end_index: typeof ann.end_index === 'number' ? ann.end_index : existing.end_index,
                        });
                      }
                    }
                    setStreamingAnnotations(Array.from(annotationsMapRef.current.values()));
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
          reasoningAccum += reasoningData.data;
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

              // Note: backend internal __METADATA__...__END__ markers are consumed in API route only
              
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
              // Only attempt to parse standardized final metadata JSON; otherwise treat as content
              try {
                const potentialJson = JSON.parse(buffer.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                } else {
                  fullContent += buffer;
                  setStreamingContent(fullContent);
                }
              } catch {
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
  // Finalize annotations from accumulator map
  const mergedAnnotations = Array.from(annotationsMapRef.current.values());
        
        // Create assistant message with metadata
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now() + 1}`,
          content: finalContent,
          role: "assistant",
          timestamp: new Date(),
          user_message_id: userMessage.id,
          model: finalMetadata?.model || model,
          contentType: finalMetadata?.contentType || "text",
          total_tokens: finalMetadata?.usage?.total_tokens || 0,
          input_tokens: finalMetadata?.usage?.prompt_tokens || 0,
          output_tokens: finalMetadata?.usage?.completion_tokens || 0,
          elapsed_ms: finalMetadata?.elapsed_ms || 0,
          completion_id: finalMetadata?.id,
          // ENHANCED: Use locally accumulated reasoning first, then state, then metadata
          ...(reasoningAccum && { reasoning: reasoningAccum }),
          ...(!reasoningAccum && streamingReasoning && { reasoning: streamingReasoning }),
          ...(!reasoningAccum && !streamingReasoning && finalMetadata?.reasoning && { reasoning: finalMetadata.reasoning }),
          ...(streamingReasoningDetails.length > 0 && { reasoning_details: streamingReasoningDetails }),
          ...(finalMetadata?.reasoning_details && streamingReasoningDetails.length === 0 && { reasoning_details: finalMetadata.reasoning_details }),
          ...(mergedAnnotations.length > 0 && { annotations: mergedAnnotations }),
          ...(mergedAnnotations.length === 0 && streamingAnnotations.length > 0 && { annotations: streamingAnnotations }),
          ...(mergedAnnotations.length === 0 && streamingAnnotations.length === 0 && finalMetadata?.annotations && Array.isArray(finalMetadata.annotations) && { annotations: finalMetadata.annotations }),
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
                      retry_available: true,
                    } : msg
                  ),
                }
              : conv
          ),
          isLoading: false,
          error: chatError,
        }));

        // Set ephemeral banner for this conversation (session-only)
        if (conversationId) {
          useChatStore.getState().setConversationErrorBanner(conversationId, {
            messageId: userMessage.id,
            message: chatError.message,
            code: chatError.code,
            createdAt: new Date().toISOString(),
          });
        }

        // NEW: Persist failed user message to DB for authenticated users
        try {
          const { user } = useAuthStore.getState();
          if (user?.id && conversationId) {
            // Retrieve the updated failed user message from state (includes error flags)
            const state = useChatStore.getState();
            const conv = state.conversations.find(c => c.id === conversationId);
            const failedUser = conv?.messages.find(m => m.id === userMessage.id);
            if (failedUser) {
              // Save ONLY the user message with error details (no assistant message)
              // Include attachmentIds if provided to allow linkage even on failure
              await fetch('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: failedUser,
                  sessionId: conversationId,
                  ...(options?.attachmentIds && { attachmentIds: options.attachmentIds }),
                }),
              });
            }
          }
        } catch (persistErr) {
          logger.warn('Failed to persist failed streaming user message', persistErr);
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning(''); // NEW: Reset reasoning state  
        setStreamingReasoningDetails([]); // NEW: Reset reasoning details state
        setStreamingAnnotations([]); // NEW: Reset annotations state
  annotationsMapRef.current.clear();
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

  const retryMessageStreaming = useCallback(async (
    messageId: string,
    content: string,
    model?: string,
    options?: {
      attachmentIds?: string[];
      webSearch?: boolean;
      webMaxResults?: number;
      reasoning?: { effort?: 'low' | 'medium' | 'high' };
    }
  ) => {
    if (!content.trim() || storeIsLoading || isStreaming) {
      logger.warn("Cannot retry message: empty content or already loading");
      return;
    }

    // Ensure we have a conversation context
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = createConversation();
    }

    // Clear error state and dismiss conversation banner first
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: conv.messages.map((msg) =>
                msg.id === messageId ? { ...msg, error: false } : msg
              ),
            }
          : conv
      ),
      error: null,
    }));
    if (conversationId) {
      useChatStore.getState().clearConversationErrorBanner(conversationId);
    }

    // Update message timestamp to reflect retry attempt
    const retryStartedAt = new Date();
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: conv.messages.map((msg) =>
                msg.id === messageId && msg.role === 'user'
                  ? { ...msg, timestamp: retryStartedAt }
                  : msg
              ),
            }
          : conv
      ),
    }));

    if (streamingEnabled) {
      // Streaming path - reuse existing streaming logic
      setIsStreaming(true);
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingReasoningDetails([]);
      setStreamingAnnotations([]);
      setStreamError(null);

      try {
        // Get conversation context
        const tokenStrategy = await getModelTokenLimits(model);
        const contextMessages = getContextMessages(tokenStrategy.maxInputTokens)
          .filter(msg => msg.id !== messageId); // Exclude the message being retried

        // Create retry message with existing ID
        const retryMessage: ChatMessage = {
          id: messageId, // Reuse existing ID
          content: content.trim(),
          role: "user",
          timestamp: retryStartedAt,
          originalModel: model,
          has_attachments: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? true : undefined,
          attachment_ids: Array.isArray(options?.attachmentIds) && options!.attachmentIds!.length > 0 ? options!.attachmentIds : undefined,
          // Store that this retry is using streaming mode
          was_streaming: true,
        };

        // Build request body similar to existing implementation
        const requestBody = {
          messages: [...contextMessages, retryMessage].map(msg => ({
            role: msg.role,
            content: msg.content,
            id: msg.id,
          })),
          model,
          current_message_id: messageId,
          attachmentIds: options?.attachmentIds,
          webSearch: options?.webSearch,
          webMaxResults: options?.webMaxResults,
          reasoning: options?.reasoning,
        };

        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current?.signal,
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
          model?: string;
          reasoning?: string;
          reasoning_details?: Record<string, unknown>[];
          annotations?: Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>;
          has_websearch?: boolean;
          websearch_result_count?: number;
        } | null = null;

        // Read the stream
        let buffer = '';
        let reasoningAccum = '';
        const annotationsMapRef = new Map();

        try {
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
                    // Accumulate and dedupe by URL (case-insensitive)
                    for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                      if (!ann || typeof ann.url !== 'string') continue;
                      const key = ann.url.toLowerCase();
                      const existing = annotationsMapRef.get(key);
                      if (!existing) {
                        annotationsMapRef.set(key, { ...ann, type: 'url_citation' });
                      } else {
                        // Merge fields, prefer newer non-empty values
                        annotationsMapRef.set(key, {
                          type: 'url_citation',
                          url: existing.url || ann.url,
                          title: ann.title || existing.title,
                          content: ann.content || existing.content,
                          start_index: typeof ann.start_index === 'number' ? ann.start_index : existing.start_index,
                          end_index: typeof ann.end_index === 'number' ? ann.end_index : existing.end_index,
                        });
                      }
                    }
                    setStreamingAnnotations(Array.from(annotationsMapRef.values()));
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
                    // Only process reasoning chunks with actual content
                    if (reasoningData.data && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                      reasoningAccum += reasoningData.data;
                      setStreamingReasoning(prev => prev + reasoningData.data);
                    }
                  }
                } catch (error) {
                  logger.warn('Failed to parse reasoning chunk:', error);
                  continue;
                }
              }

              // Check if this line contains final metadata
              try {
                const potentialJson = JSON.parse(line.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  continue;
                }
              } catch {
                // Not JSON, treat as regular content
              }

              // Regular content - add to display
              fullContent += line + '\n';
              setStreamingContent(fullContent);
            }

            // Handle any remaining content in buffer
            if (buffer && !finalMetadata) {
              try {
                const potentialJson = JSON.parse(buffer.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                } else {
                  fullContent += buffer;
                  setStreamingContent(fullContent);
                }
              } catch {
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
        const mergedAnnotations = Array.from(annotationsMapRef.values());

        // Create assistant message with metadata
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now() + 1}`,
          content: finalContent,
          role: "assistant",
          timestamp: new Date(),
          user_message_id: messageId,
          model: finalMetadata?.model || model,
          contentType: finalMetadata?.contentType || "text",
          total_tokens: finalMetadata?.usage?.total_tokens || 0,
          input_tokens: finalMetadata?.usage?.prompt_tokens || 0,
          output_tokens: finalMetadata?.usage?.completion_tokens || 0,
          elapsed_ms: finalMetadata?.elapsed_ms || 0,
          completion_id: finalMetadata?.id,
          ...(reasoningAccum && { reasoning: reasoningAccum }),
          ...(!reasoningAccum && finalMetadata?.reasoning && { reasoning: finalMetadata.reasoning }),
          ...(mergedAnnotations.length > 0 && { annotations: mergedAnnotations }),
          ...(mergedAnnotations.length === 0 && finalMetadata?.annotations && Array.isArray(finalMetadata.annotations) && { annotations: finalMetadata.annotations }),
          ...(finalMetadata?.has_websearch !== undefined && { has_websearch: finalMetadata.has_websearch }),
          ...(finalMetadata?.websearch_result_count !== undefined && { websearch_result_count: finalMetadata.websearch_result_count }),
        };

        // Update user message with input tokens from metadata
        const updatedUserMessage = {
          ...retryMessage,
          input_tokens: finalMetadata?.usage?.prompt_tokens || 0,
        };

        // Update existing user message and add assistant message
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === messageId ? { ...updatedUserMessage, retry_available: undefined } : msg
                  ).concat(assistantMessage), // Update existing user message and add assistant
                  updatedAt: new Date().toISOString(),
                }
              : conv
          ),
        }));

        // Auto-generate title from first user message if it's still "New Chat"
        const currentConv = useChatStore.getState().conversations.find(c => c.id === conversationId);
        if (currentConv && currentConv.title === "New Chat" && currentConv.messages.length === 2) {
          const autoTitle = content.length > 50 ? content.substring(0, 50) + "..." : content;
          useChatStore.getState().updateConversationTitle(conversationId, autoTitle, true);
        }

        // Trigger database sync
        try {
          const currentState = useChatStore.getState();
          const updatedConv = currentState.conversations.find(c => c.id === conversationId);

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

          if (shouldIncludeTitle) {
            syncPayload.sessionTitle = updatedConv?.title;
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
          }
        } catch (syncError) {
          logger.warn('Database sync failed:', syncError);
        }

  } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const chatError: ChatError = {
          message: error instanceof Error ? error.message : 'Streaming failed',
          code: 'stream_error',
          timestamp: new Date().toISOString(),
        };
        setStreamError(chatError);
        logger.error('Streaming error:', error);

        // Mark existing message as failed again
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === messageId ? {
                      ...msg,
                      error: true,
                      input_tokens: 0,
                      error_message: chatError.message,
                    } : msg
                  ),
                }
              : conv
          ),
          isLoading: false,
          error: chatError,
        }));

        // Set ephemeral banner for this conversation (session-only)
        if (conversationId) {
          useChatStore.getState().setConversationErrorBanner(conversationId, {
            messageId,
            message: chatError.message,
            code: chatError.code,
            createdAt: new Date().toISOString(),
          });
        }

        // NEW: Persist failed retried user message to DB for authenticated users
        try {
          const { user } = useAuthStore.getState();
          if (user?.id && conversationId) {
            const state = useChatStore.getState();
            const conv = state.conversations.find(c => c.id === conversationId);
            const failedUser = conv?.messages.find(m => m.id === messageId);
            if (failedUser) {
              await fetch('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: failedUser,
                  sessionId: conversationId,
                  ...(options?.attachmentIds && { attachmentIds: options.attachmentIds }),
                }),
              });
            }
          }
        } catch (persistErr) {
          logger.warn('Failed to persist failed streaming retry user message', persistErr);
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingReasoningDetails([]);
        setStreamingAnnotations([]);
        setStreamError(null);
        abortControllerRef.current = null;
      }
    } else {
      // Non-streaming path - delegate to existing store implementation
      const storeRetryMessage = useChatStore.getState().retryMessage;
      await storeRetryMessage(messageId, content, model);
    }
  }, [
    streamingEnabled,
    storeIsLoading,
    isStreaming,
    currentConversationId,
    createConversation,
    getContextMessages,
  ]);

  const retryLastMessage = useCallback(async () => {
    const messages = getCurrentMessages();
    const lastFailedMessage = messages
      .slice()
      .reverse()
      .find(msg => msg.role === 'user' && msg.error); // Only retry failed messages
      
    if (lastFailedMessage) {
      // Check if the original message was sent with streaming enabled
      const shouldUseStreaming = lastFailedMessage.was_streaming === true;
      
      if (shouldUseStreaming) {
        // Original message was sent with streaming - use streaming retry
        await retryMessageStreaming(
          lastFailedMessage.id,
          lastFailedMessage.content,
          lastFailedMessage.originalModel,
          {
            attachmentIds: lastFailedMessage.attachment_ids,
            webSearch: lastFailedMessage.has_websearch,
            // TODO: Extract reasoning from original message
          }
        );
      } else {
        // Original message was sent without streaming - use non-streaming retry
        // Clear the specific message error first so the banner dismisses while retrying
        const store = useChatStore.getState();
        store.clearError?.();
        store.clearMessageError(lastFailedMessage.id);
        await store.retryMessage(
          lastFailedMessage.id,
          lastFailedMessage.content,
          lastFailedMessage.originalModel
        );
      }
    }
  }, [getCurrentMessages, retryMessageStreaming]);

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
