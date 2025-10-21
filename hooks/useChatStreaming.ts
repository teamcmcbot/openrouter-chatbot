"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '../lib/types/chat';
import { useChatStore, updateConversationFromMessages } from '../stores/useChatStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuth, useAuthStore } from '../stores/useAuthStore';
import { emitAnonymousError, emitAnonymousUsage } from '../lib/analytics/anonymous';
import { createLogger } from '../stores/storeUtils';
import { isStreamingDebugEnabled, streamDebug } from '../lib/utils/streamDebug';
import { checkRateLimitHeaders } from '../lib/utils/rateLimitNotifications';
import { getModelTokenLimits } from '../lib/utils/tokens';
import { persistAssistantImages } from '../lib/utils/persistAssistantImages';

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
  reasoning?: { effort?: 'low' | 'medium' | 'high' };
  imageOutput?: boolean;
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
  const streamingDebug = isStreamingDebugEnabled();
  
  // Debug markers removed; use logger + streamDebug when needed
  
  // Get user authentication for request context (used for authenticated features)
  const { isAuthenticated } = useAuth();

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
  reasoning?: { effort?: 'low' | 'medium' | 'high' };
  imageOutput?: boolean;
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
  // Capture request-side options for accurate retry later
  requested_web_search: options?.webSearch,
  requested_web_max_results: options?.webMaxResults,
  requested_reasoning_effort: options?.reasoning?.effort,
  requested_image_output: options?.imageOutput,
    };

    if (streamingEnabled) {
  if (streamingDebug) streamDebug('sendMessage: streaming path', { model, hasAttachments: !!options?.attachmentIds, web: options?.webSearch, max: options?.webMaxResults, effort: options?.reasoning?.effort });
      
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
            ? updateConversationFromMessages({
                ...conv,
                messages: [...conv.messages, userMessage],
              })
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
          // Always include explicit boolean (false included) for parity with non-stream route
          imageOutput: !!options?.imageOutput,
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
          if (streamingDebug) streamDebug('sendMessage: non-ok response', response.status);
          // Handle rate limiting
          if (response.status === 429) {
            checkRateLimitHeaders(response);
          }

          const errorData = await response.json().catch(() => ({}));
          // Anonymous error emit (best-effort)
          if (!isAuthenticated) {
            emitAnonymousError({
              timestamp: new Date().toISOString(),
              model: String(model || ''),
              http_status: response.status,
              error_code: typeof errorData.code === 'string' ? errorData.code : undefined,
              error_message: typeof errorData.error === 'string' ? errorData.error : `HTTP ${response.status}`,
              provider: typeof errorData.upstreamProvider === 'string' ? errorData.upstreamProvider : undefined,
              provider_request_id: typeof errorData.upstreamProviderRequestId === 'string' ? errorData.upstreamProviderRequestId : undefined,
              metadata: {
                streaming: true,
                ...(errorData.upstreamErrorCode !== undefined ? { upstreamErrorCode: errorData.upstreamErrorCode } : {}),
                ...(errorData.upstreamErrorMessage ? { upstreamErrorMessage: errorData.upstreamErrorMessage } : {}),
                ...(response.headers.get('x-request-id') ? { api_request_id: response.headers.get('x-request-id') as string } : {}),
              },
            });
          }
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
          usage?: { 
            prompt_tokens: number; 
            completion_tokens: number; 
            total_tokens: number;
            prompt_tokens_details?: {
              cached_tokens?: number;
            };
            completion_tokens_details?: {
              reasoning_tokens?: number;
              image_tokens?: number;
            };
          };
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
          images?: string[];
        } | null = null;

  // Read the stream
        // Local accumulators to avoid relying on async state updates
        let reasoningAccum = '';
  // Incremental image streaming removed: collect only from final metadata
  // Incremental streaming images removed; final images only from metadata
  let buffer = '';
  try {
          
          while (true) {
    const { done, value } = await reader.read();
    if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
  // DEBUG: chunk snapshot (truncated)
  try { logger.debug(`[STREAM-NORMAL] chunk len=${chunk.length}, head='${chunk.slice(0, 80).replace(/\n/g, '\\n')}'`); } catch {}
  if (streamingDebug) streamDebug('STREAM-NORMAL chunk', { len: chunk.length, head: chunk.slice(0, 80) });
            buffer += chunk;
            
            // Look for complete JSON lines (ending with newline)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              // (Removed) incremental image parsing/delta markers

              // Check for annotation chunks FIRST
              if (line.startsWith('__ANNOTATIONS_CHUNK__')) {
        try {
                  const annotationData = JSON.parse(line.replace('__ANNOTATIONS_CHUNK__', ''));
                  if (annotationData.type === 'annotations' && Array.isArray(annotationData.data)) {
        try { logger.debug(`[STREAM-NORMAL] annotations chunk count=${annotationData.data.length}`); } catch {}
          if (streamingDebug) streamDebug('STREAM-NORMAL annotations chunk', annotationData.data.length);
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
          try { logger.debug(`[STREAM-NORMAL] reasoning chunk head='${String(reasoningData.data).slice(0, 60).replace(/\n/g, ' ')}'`); } catch {}
                      if (streamingDebug) streamDebug('STREAM-NORMAL reasoning chunk', String(reasoningData.data).slice(0, 60));
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
                  // If images came only in final metadata, adopt them (only if none streamed)
                  // If images only arrive in final metadata, adopt them later during assistant message creation (no incremental handling)
                  try { logger.debug('[STREAM-NORMAL] final metadata received'); } catch {}
                  if (streamingDebug) streamDebug('STREAM-NORMAL final metadata');
                  // Don't break here - continue reading to ensure stream is complete
                  continue;
                }
              } catch {
                // Not JSON, treat as regular content
              }
              
              // Regular content - add to display
              try {
                const head = line.slice(0, 60);
                logger.debug(`[STREAM-NORMAL] appending content line head='${head.replace(/\n/g, ' ')}'`);
              } catch {}
              // Strip any accidental inline image delta markers before appending
              const sanitized = line
                .replace(/__IMAGE_DELTA_CHUNK__\{[^\n]*\}/g, '')
                .trimEnd();
              if (sanitized.length > 0) {
                fullContent += sanitized + '\n';
              }
              setStreamingContent(fullContent);
            }
            
            // Handle any remaining content in buffer (without newline)
            if (buffer && !finalMetadata) {
              try { logger.debug(`[STREAM-NORMAL] buffer flush len=${buffer.length}, head='${buffer.slice(0, 80).replace(/\n/g, '\\n')}'`); } catch {}
              if (streamingDebug) streamDebug('STREAM-NORMAL buffer flush', { len: buffer.length, head: buffer.slice(0, 80) });

              // Marker-aware guard: don't leak partial marker lines into content
              const startsWithReasoning = buffer.startsWith('__REASONING_CHUNK__');
              const startsWithAnnotations = buffer.startsWith('__ANNOTATIONS_CHUNK__');

              // First, attempt to parse final metadata JSON strictly
              let handled = false;
              try {
                const potentialJson = JSON.parse(buffer.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  handled = true;
                }
              } catch {
                // ignore, may not be JSON
              }

              if (!handled && (startsWithReasoning || startsWithAnnotations)) {
                // Try to parse complete marker payloads; if incomplete, keep buffer for next chunk
                try {
                  if (startsWithReasoning) {
                    const reasoningData = JSON.parse(buffer.replace('__REASONING_CHUNK__', ''));
                    if (reasoningData?.type === 'reasoning' && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                      reasoningAccum += reasoningData.data;
                      setStreamingReasoning(prev => prev + reasoningData.data);
                      handled = true;
                    } else {
                      // Incomplete or empty marker payload; keep buffer
                    }
                  } else if (startsWithAnnotations) {
                    const annotationData = JSON.parse(buffer.replace('__ANNOTATIONS_CHUNK__', ''));
                    if (annotationData?.type === 'annotations' && Array.isArray(annotationData.data)) {
                      for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                        if (!ann || typeof ann.url !== 'string') continue;
                        const key = ann.url.toLowerCase();
                        const existing = annotationsMapRef.current.get(key);
                        if (!existing) {
                          annotationsMapRef.current.set(key, { ...ann, type: 'url_citation' });
                        } else {
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
                      handled = true;
                    } else {
                      // Incomplete marker payload; keep buffer
                    }
                  }
                } catch {
                  // Likely partial JSON; keep buffer for next iteration
                }
              }

              if (!handled) {
                // Safe to append only if not starting with known markers
                if (!startsWithReasoning && !startsWithAnnotations) {
                  try { logger.debug(`[STREAM-NORMAL] buffer appended as content`); } catch {}
                  const sanitizedBuffer = buffer.replace(/__IMAGE_DELTA_CHUNK__\{[^\n]*\}/g, '');
                  fullContent += sanitizedBuffer;
                  setStreamingContent(fullContent);
                  buffer = '';
                } else {
                  try { logger.debug(`[STREAM-NORMAL] buffer kept for next chunk due to marker start`); } catch {}
                  if (streamingDebug) streamDebug('STREAM-NORMAL buffer kept');
                  // Keep buffer untouched; wait for next chunk/newline
                }
              } else {
                // Handled (metadata/marker parsed) -> clear buffer
                buffer = '';
              }
            }
          }
        } finally {
          // After loop EOF: final attempt to parse remaining buffer (no trailing newline case)
          if (buffer && !finalMetadata) {
            try { logger.debug(`[STREAM-NORMAL][EOF-FINAL] buffer len=${buffer.length}, head='${buffer.slice(0,80).replace(/\n/g,'\\n')}'`); } catch {}
            if (streamingDebug) streamDebug('STREAM-NORMAL EOF-FINAL buffer', { len: buffer.length, head: buffer.slice(0,80) });
            let handled = false;
            try {
              const potentialJson = JSON.parse(buffer.trim());
              if (potentialJson.__FINAL_METADATA__) {
                finalMetadata = potentialJson.__FINAL_METADATA__;
                handled = true;
              }
            } catch {}
            if (!handled) {
              const startsWithReasoning = buffer.startsWith('__REASONING_CHUNK__');
              const startsWithAnnotations = buffer.startsWith('__ANNOTATIONS_CHUNK__');
              try {
                if (startsWithReasoning) {
                  const reasoningData = JSON.parse(buffer.replace('__REASONING_CHUNK__',''));
                  if (reasoningData?.type === 'reasoning' && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                    reasoningAccum += reasoningData.data;
                    setStreamingReasoning(prev => prev + reasoningData.data);
                    handled = true;
                  }
                } else if (startsWithAnnotations) {
                  const annotationData = JSON.parse(buffer.replace('__ANNOTATIONS_CHUNK__',''));
                  if (annotationData?.type === 'annotations' && Array.isArray(annotationData.data)) {
                    for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                      if (!ann || typeof ann.url !== 'string') continue;
                      const key = ann.url.toLowerCase();
                      const existing = annotationsMapRef.current.get(key);
                      if (!existing) {
                        annotationsMapRef.current.set(key, { ...ann, type: 'url_citation' });
                      } else {
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
                    handled = true;
                  }
                }
              } catch {}
              if (!handled && !startsWithReasoning && !startsWithAnnotations) {
                const sanitized = buffer.replace(/__IMAGE_DELTA_CHUNK__\{[^\n]*\}/g,'');
                if (sanitized.trim().length > 0) {
                  fullContent += sanitized + (sanitized.endsWith('\n') ? '' : '\n');
                }
              }
            }
          }
          reader.releaseLock();
        }

  // Use final content from metadata if available, otherwise use accumulated content
  let finalContent = finalMetadata?.response || fullContent;
  // Fallback scrub: if raw __FINAL_METADATA__ JSON was appended (missed earlier parse), extract & apply
  if (!finalMetadata) {
    const lines = finalContent.split(/\n+/).filter(l => l.trim().length > 0);
    const lastLine = lines[lines.length - 1];
    if (lastLine && lastLine.includes('__FINAL_METADATA__')) {
      try {
        const possible = JSON.parse(lastLine.trim());
        if (possible && possible.__FINAL_METADATA__) {
          finalMetadata = possible.__FINAL_METADATA__;
          // Remove raw JSON line from displayed content
          lines.pop();
          // finalMetadata now set; use non-null assertion for TS
          finalContent = ((finalMetadata!.response) || lines.join('\n')).trimEnd();
        }
      } catch {}
    }
  }
  // Finalize annotations from accumulator map
  const mergedAnnotations = Array.from(annotationsMapRef.current.values());
        
        // Remove transient draft assistant if present before committing final assistant message
        useChatStore.setState(state => ({
          conversations: state.conversations.map(c => c.id === conversationId ? { ...c, messages: c.messages.filter(m => !(m.role === 'assistant' && m.was_streaming && m.id.startsWith('draft_stream_'))) } : c)
        }));

        // Fallback image extraction (final content scan) if imageOutput requested but no delta images arrived
        let finalOutputImages: string[] | undefined;
        if (options?.imageOutput) {
          // Adopt images from final metadata only (no incremental accumulation)
          if (finalMetadata?.images && Array.isArray(finalMetadata.images) && finalMetadata.images.length > 0) {
            const dedup = Array.from(new Set(finalMetadata.images.filter(i => typeof i === 'string' && i.startsWith('data:image/'))));
            if (dedup.length > 0) finalOutputImages = dedup;
          }
        }

        // IMPORTANT: Clear streaming state BEFORE adding final message to prevent double-render
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingReasoningDetails([]);
        setStreamingAnnotations([]);
        annotationsMapRef.current.clear();

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
          // Phase 4A: Extract image tokens from completion_tokens_details if present
          ...(finalMetadata?.usage?.completion_tokens_details?.image_tokens && {
            output_image_tokens: finalMetadata.usage.completion_tokens_details.image_tokens
          }),
          elapsed_ms: finalMetadata?.elapsed_ms || 0,
          completion_id: finalMetadata?.id,
          // Mark assistant message as streamed
          was_streaming: true,
          ...(options?.imageOutput && finalOutputImages && finalOutputImages.length > 0 && { output_images: finalOutputImages, requested_image_output: true }),
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

        // Anonymous usage emit on success (best-effort)
        try {
          if (!isAuthenticated) {
            const events = [
              { timestamp: new Date().toISOString(), type: 'message_sent' as const, model },
              {
                timestamp: new Date().toISOString(),
                type: 'completion_received' as const,
                model: assistantMessage.model,
                input_tokens: updatedUserMessage.input_tokens,
                output_tokens: assistantMessage.output_tokens,
                elapsed_ms: assistantMessage.elapsed_ms,
              },
            ];
            emitAnonymousUsage(events);
          }
        } catch {}

        // Add both messages to store
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? updateConversationFromMessages({
                  ...conv,
                  messages: [
                    ...conv.messages.slice(0, -1), // Remove the temporary user message
                    updatedUserMessage, // Add updated user message with tokens
                    assistantMessage // Add assistant message
                  ],
                })
              : conv
          ),
        }));

        // Auto-generate title from first user message if it's still "New Chat" (same logic as non-streaming)
        const currentConv = useChatStore.getState().conversations.find(c => c.id === conversationId);
        if (currentConv && currentConv.title === "New Chat" && currentConv.messages.length === 2) {
          const autoTitle = content.length > 50 ? content.substring(0, 50) + "..." : content;
          useChatStore.getState().updateConversationTitle(conversationId, autoTitle, true); // Mark as auto-generated
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
          } else {
            // no title needed
          }

          // Only persist for authenticated users; skip for anonymous
          const { user } = useAuthStore.getState();
          if (user?.id) {
            // Phase 4A: Create cleaned assistant message for database persistence
            const assistantMessageForDB = { ...assistantMessage };
            
            // Remove data URLs from output_images for database payload (keep count only)
            if (assistantMessageForDB.output_images && assistantMessageForDB.output_images.length > 0) {
              // Add image count for database tracking
              assistantMessageForDB.output_image_count = assistantMessage.output_images!.length;
              
              // Remove actual data URLs from database payload (too large for DB)
              delete assistantMessageForDB.output_images;
            }
            
            // Calculate text-only output_tokens for database (provider-aware)
            // OpenAI: completion_tokens already text-only, don't subtract
            // Google: completion_tokens includes images, subtract to get text-only
            if (assistantMessageForDB.output_image_tokens && assistantMessageForDB.output_tokens) {
              const isOpenAI = assistantMessageForDB.model?.startsWith('openai/');
              if (!isOpenAI) {
                // Google/other providers: subtract image tokens from completion tokens
                assistantMessageForDB.output_tokens = assistantMessageForDB.output_tokens - assistantMessageForDB.output_image_tokens;
              }
              // OpenAI: keep output_tokens as-is (already text-only)
            }
            
            // Recalculate total_tokens for OpenAI image models (additive, not from API)
            // OpenAI API returns incorrect total_tokens for image generation
            if (assistantMessageForDB.model?.startsWith('openai/') && assistantMessageForDB.output_image_tokens) {
              assistantMessageForDB.total_tokens = 
                (assistantMessageForDB.input_tokens || 0) + 
                (assistantMessageForDB.output_tokens || 0) + 
                (assistantMessageForDB.output_image_tokens || 0);
            }
            
            // Update syncPayload with cleaned message
            syncPayload.messages[1] = assistantMessageForDB;

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
              
              // Phase 4A: Persist assistant images AFTER database sync (fixes timing race condition)
              if (assistantMessage.output_images && assistantMessage.output_images.length > 0) {
                persistAssistantImages(
                  assistantMessage.output_images, 
                  assistantMessage.id, 
                  conversationId
                ).then(persistedUrls => {
                  // Update the assistant message with persisted URLs (swap data URLs for signed URLs)
                  useChatStore.setState((state) => ({
                    conversations: state.conversations.map((conv) =>
                      conv.id === conversationId
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
                }).catch(error => {
                  logger.warn('Failed to persist assistant images, keeping data URLs', { 
                    messageId: assistantMessage.id, 
                    conversationId,
                    error 
                  });
                  // Images remain as data URLs - graceful degradation
                });
              }
            }
          } else {
            logger.debug('Skipping /api/chat/messages persistence for anonymous user');
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

        // Anonymous error emit for network/exception path
        try {
          if (!isAuthenticated) {
            emitAnonymousError({
              timestamp: new Date().toISOString(),
              model: String(model || ''),
              error_code: 'stream_error',
              error_message: chatError.message,
              metadata: { streaming: true },
            });
          }
        } catch {}
        
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
        // Cleanup is now handled before adding final message (to prevent double-render)
        // Only reset streaming state here for error cases
        if (abortControllerRef.current) {
          setIsStreaming(false);
          setStreamingContent('');
          setStreamingReasoning('');
          setStreamingReasoningDetails([]);
          setStreamingAnnotations([]);
          annotationsMapRef.current.clear();
        }
        abortControllerRef.current = null;
      }
    } else {
  // Non-streaming path - delegate to existing store implementation
  const storeSendMessage = useChatStore.getState().sendMessage;
  await storeSendMessage(content, model, options);
    }
  }, [
    streamingEnabled,
    streamingDebug,
    storeIsLoading,
    isStreaming,
    currentConversationId,
    createConversation,
    getContextMessages,
    streamingReasoning,
    streamingReasoningDetails,
    streamingAnnotations,
  isAuthenticated,
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
  imageOutput?: boolean;
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

  // Force streaming regardless of current toggle when this path is chosen
  if (true) {
      if (streamingDebug) streamDebug('retryMessageStreaming: streaming retry', { messageId, model });
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
          ...(options?.imageOutput && { imageOutput: true }),
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
          // Anonymous error emit on retry failure
          if (!isAuthenticated) {
            emitAnonymousError({
              timestamp: new Date().toISOString(),
              model: String(model || ''),
              http_status: response.status,
              error_code: typeof errorData.code === 'string' ? errorData.code : undefined,
              error_message: typeof errorData.error === 'string' ? errorData.error : `HTTP ${response.status}`,
              provider: typeof errorData.upstreamProvider === 'string' ? errorData.upstreamProvider : undefined,
              provider_request_id: typeof errorData.upstreamProviderRequestId === 'string' ? errorData.upstreamProviderRequestId : undefined,
              metadata: {
                streaming: true,
                retry: true,
                ...(errorData.upstreamErrorCode !== undefined ? { upstreamErrorCode: errorData.upstreamErrorCode } : {}),
                ...(errorData.upstreamErrorMessage ? { upstreamErrorMessage: errorData.upstreamErrorMessage } : {}),
                ...(response.headers.get('x-request-id') ? { api_request_id: response.headers.get('x-request-id') as string } : {}),
              },
            });
          }
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
    // Local accumulators to avoid relying on async state updates
    let reasoningAccum = '';
    // Local annotations accumulator for retry path (case-insensitive by URL)
    const retryAnnotationsMap: Map<string, { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }> = new Map();

    try {
          while (true) {
    const { done, value } = await reader.read();
            if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // DEBUG: chunk snapshot (retry)
      try { logger.debug(`[STREAM-RETRY] chunk len=${chunk.length}, head='${chunk.slice(0, 80).replace(/\n/g, '\\n')}'`); } catch {}
  if (streamingDebug) streamDebug('STREAM-RETRY chunk', { len: chunk.length, head: chunk.slice(0, 80) });
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
                    try { logger.debug(`[STREAM-RETRY] annotations chunk count=${annotationData.data.length}`); } catch {}
          if (streamingDebug) streamDebug('STREAM-RETRY annotations chunk', annotationData.data.length);
                    // Accumulate and dedupe by URL (case-insensitive)
                    for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                      if (!ann || typeof ann.url !== 'string') continue;
                      const key = ann.url.toLowerCase();
                      const existing = retryAnnotationsMap.get(key);
                      if (!existing) {
                        retryAnnotationsMap.set(key, { ...ann, type: 'url_citation' });
                      } else {
                        // Merge fields, prefer newer non-empty values
                        retryAnnotationsMap.set(key, {
                          type: 'url_citation',
                          url: existing.url || ann.url,
                          title: ann.title || existing.title,
                          content: ann.content || existing.content,
                          start_index: typeof ann.start_index === 'number' ? ann.start_index : existing.start_index,
                          end_index: typeof ann.end_index === 'number' ? ann.end_index : existing.end_index,
                        });
                      }
                    }
                    setStreamingAnnotations(Array.from(retryAnnotationsMap.values()));
                    // IMPORTANT: Don't leak annotation chunk into content
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
                  try { logger.debug(`[STREAM-RETRY] reasoning chunk head='${String(reasoningData.data).slice(0, 60).replace(/\n/g, ' ')}'`); } catch {}
                  if (streamingDebug) streamDebug('STREAM-RETRY reasoning chunk', String(reasoningData.data).slice(0, 60));
                  if (reasoningData.type === 'reasoning') {
                    // Only process reasoning chunks with actual content
                    if (reasoningData.data && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                      reasoningAccum += reasoningData.data;
                      setStreamingReasoning(prev => prev + reasoningData.data);
                    }
                    // IMPORTANT: Don't leak reasoning chunk into content
                    continue;
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
                  try { logger.debug('[STREAM-RETRY] final metadata received'); } catch {}
                  if (streamingDebug) streamDebug('STREAM-RETRY final metadata');
                  continue;
                }
              } catch {
                // Not JSON, treat as regular content
              }

              // Regular content - add to display
              try {
                const head = line.slice(0, 60);
                logger.debug(`[STREAM-RETRY] appending content line head='${head.replace(/\n/g, ' ')}'`);
              } catch {}
              fullContent += line + '\n';
              setStreamingContent(fullContent);
            }

            // Handle any remaining content in buffer
            if (buffer && !finalMetadata) {
              try { logger.debug(`[STREAM-RETRY] buffer flush len=${buffer.length}, head='${buffer.slice(0, 80).replace(/\n/g, '\\n')}'`); } catch {}
              if (streamingDebug) streamDebug('STREAM-RETRY buffer flush', { len: buffer.length, head: buffer.slice(0, 80) });

              const startsWithReasoning = buffer.startsWith('__REASONING_CHUNK__');
              const startsWithAnnotations = buffer.startsWith('__ANNOTATIONS_CHUNK__');
              let handled = false;

              // Final metadata JSON attempt
              try {
                const potentialJson = JSON.parse(buffer.trim());
                if (potentialJson.__FINAL_METADATA__) {
                  finalMetadata = potentialJson.__FINAL_METADATA__;
                  handled = true;
                }
              } catch {
                // ignore
              }

              if (!handled && (startsWithReasoning || startsWithAnnotations)) {
                try {
                  if (startsWithReasoning) {
                    const reasoningData = JSON.parse(buffer.replace('__REASONING_CHUNK__', ''));
                    if (reasoningData?.type === 'reasoning' && typeof reasoningData.data === 'string' && reasoningData.data.trim()) {
                      reasoningAccum += reasoningData.data;
                      setStreamingReasoning(prev => prev + reasoningData.data);
                      handled = true;
                    }
                  } else if (startsWithAnnotations) {
                    const annotationData = JSON.parse(buffer.replace('__ANNOTATIONS_CHUNK__', ''));
                    if (annotationData?.type === 'annotations' && Array.isArray(annotationData.data)) {
                      for (const ann of annotationData.data as Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>) {
                        if (!ann || typeof ann.url !== 'string') continue;
                        const key = ann.url.toLowerCase();
                        const existing = retryAnnotationsMap.get(key);
                        if (!existing) {
                          retryAnnotationsMap.set(key, { ...ann, type: 'url_citation' });
                        } else {
                          retryAnnotationsMap.set(key, {
                            type: 'url_citation',
                            url: existing.url || ann.url,
                            title: ann.title || existing.title,
                            content: ann.content || existing.content,
                            start_index: typeof ann.start_index === 'number' ? ann.start_index : existing.start_index,
                            end_index: typeof ann.end_index === 'number' ? ann.end_index : existing.end_index,
                          });
                        }
                      }
                      setStreamingAnnotations(Array.from(retryAnnotationsMap.values()));
                      handled = true;
                    }
                  }
                } catch {
                  // Partial; keep buffer
                }
              }

              if (!handled) {
                if (!startsWithReasoning && !startsWithAnnotations) {
                  try { logger.debug(`[STREAM-RETRY] buffer appended as content`); } catch {}
                  fullContent += buffer;
                  setStreamingContent(fullContent);
                  buffer = '';
                } else {
                  try { logger.debug(`[STREAM-RETRY] buffer kept for next chunk due to marker start`); } catch {}
                  // keep buffer
                }
              } else {
                buffer = '';
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Use final content from metadata if available, otherwise use accumulated content
        let finalContent = finalMetadata?.response || fullContent;
        if (!finalMetadata) {
          const lines = finalContent.split(/\n+/).filter(l => l.trim().length > 0);
          const lastLine = lines[lines.length - 1];
          if (lastLine && lastLine.includes('__FINAL_METADATA__')) {
            try {
              const possible = JSON.parse(lastLine.trim());
              if (possible && possible.__FINAL_METADATA__) {
                finalMetadata = possible.__FINAL_METADATA__;
                lines.pop();
                finalContent = ((finalMetadata!.response) || lines.join('\n')).trimEnd();
              }
            } catch {}
          }
        }
  const mergedAnnotations = Array.from(retryAnnotationsMap.values());

        // IMPORTANT: Clear streaming state BEFORE adding final message to prevent double-render
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingReasoningDetails([]);
        setStreamingAnnotations([]);
        setStreamError(null);

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
          // Mark assistant message as streamed on retry
          was_streaming: true,
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

        // Anonymous usage emit on retry success
        try {
          if (!isAuthenticated) {
            const events = [
              { timestamp: new Date().toISOString(), type: 'message_sent' as const, model },
              {
                timestamp: new Date().toISOString(),
                type: 'completion_received' as const,
                model: assistantMessage.model,
                input_tokens: updatedUserMessage.input_tokens,
                output_tokens: assistantMessage.output_tokens,
                elapsed_ms: assistantMessage.elapsed_ms,
              },
            ];
            emitAnonymousUsage(events);
          }
        } catch {}

        // Update existing user message and add assistant message
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? updateConversationFromMessages({
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === messageId ? { ...updatedUserMessage, retry_available: undefined } : msg
                  ).concat(assistantMessage), // Update existing user message and add assistant
                })
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

          // Only persist for authenticated users; skip for anonymous
          const { user } = useAuthStore.getState();
          if (user?.id) {
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
          } else {
            logger.debug('Skipping /api/chat/messages persistence for anonymous user (retry)');
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

        // Anonymous error on retry exception
        try {
          if (!isAuthenticated) {
            emitAnonymousError({
              timestamp: new Date().toISOString(),
              model: String(model || ''),
              error_code: 'stream_error',
              error_message: chatError.message,
              metadata: { streaming: true, retry: true },
            });
          }
        } catch {}

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
        // Cleanup is now handled before adding final message (to prevent double-render)
        // Only reset streaming state here for error cases
        if (abortControllerRef.current) {
          setIsStreaming(false);
          setStreamingContent('');
          setStreamingReasoning('');
          setStreamingReasoningDetails([]);
          setStreamingAnnotations([]);
          setStreamError(null);
        }
        abortControllerRef.current = null;
      }
  } 
  }, [
    storeIsLoading,
    isStreaming,
    currentConversationId,
    createConversation,
    getContextMessages,
    streamingDebug,
  isAuthenticated,
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
      // Reconstruct original options from the failed user message
      const originalOptions: {
        attachmentIds?: string[];
        webSearch?: boolean;
        webMaxResults?: number;
        reasoning?: { effort?: 'low' | 'medium' | 'high' };
      } = {
        attachmentIds: lastFailedMessage.attachment_ids,
        webSearch: lastFailedMessage.requested_web_search,
        webMaxResults: lastFailedMessage.requested_web_max_results,
        reasoning: lastFailedMessage.requested_reasoning_effort
          ? { effort: lastFailedMessage.requested_reasoning_effort }
          : undefined,
      };
      
      if (shouldUseStreaming) {
        // Original message was sent with streaming - use streaming retry
        await retryMessageStreaming(
          lastFailedMessage.id,
          lastFailedMessage.content,
          lastFailedMessage.originalModel,
          originalOptions
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
          lastFailedMessage.originalModel,
          originalOptions
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
