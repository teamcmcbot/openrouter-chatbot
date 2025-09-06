"use client";

import { useState, useCallback } from "react";
import { logger } from "../lib/utils/logger";
import { ChatMessage } from "../lib/types/chat";

interface ChatError {
  message: string;
  code?: string;
  suggestions?: string[];
  retryAfter?: number;
  timestamp?: string;
}

interface SendOptions {
  attachmentIds?: string[];
  draftId?: string;
  webSearch?: boolean;
  webMaxResults?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high' };
  imageOutput?: boolean; // NEW: request assistant image output when supported
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null;
  sendMessage: (content: string, model?: string, options?: SendOptions) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  clearMessageError: (messageId: string) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const sendMessage = useCallback(async (content: string, model?: string, options?: SendOptions) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
  // Preserve request-side options for exact retry (Phase 2: image output)
  requested_image_output: options?.imageOutput || false,
  requested_web_search: options?.webSearch,
  requested_web_max_results: options?.webMaxResults,
  requested_reasoning_effort: options?.reasoning?.effort,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: {
        message: string;
        model?: string;
        messages?: ChatMessage[];
        current_message_id?: string;
        attachmentIds?: string[];
        draftId?: string;
        webSearch?: boolean;
        webMaxResults?: number;
        reasoning?: { effort?: 'low' | 'medium' | 'high' };
        imageOutput?: boolean;
      } = {
        message: content,
        messages: [userMessage], // Send the user message with its ID
        current_message_id: userMessage.id,
        ...(options?.attachmentIds && { attachmentIds: options.attachmentIds }),
        ...(options?.draftId && { draftId: options.draftId }),
        ...(options?.webSearch !== undefined && { webSearch: options.webSearch }),
        ...(options?.webMaxResults !== undefined && { webMaxResults: options.webMaxResults }),
        ...(options?.reasoning && { reasoning: options.reasoning }),
  // Always include explicit boolean so backend can distinguish omission
  imageOutput: !!options?.imageOutput,
      };
      if (model) {
        requestBody.model = model;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const chatError: ChatError = {
          message: errorData.error ?? `HTTP error! status: ${response.status}`,
          code: errorData.code,
          suggestions: errorData.suggestions,
          retryAfter: errorData.retryAfter,
          timestamp: errorData.timestamp,
        };
        throw chatError;
      }

      // Handle backend response with 'data' property
      const raw = await response.json();
      const data = raw.data ?? raw;

      if (data.error) {
        throw new Error(data.error);
      }

  logger.debug('Raw API response data:', data);
  logger.debug('Usage object:', data.usage);
  logger.debug('Individual token values:', {
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens
      });

      type ChatResponseWithReasoning = { reasoning?: string; reasoning_details?: Record<string, unknown>[] };
      const respWithReasoning = data as ChatResponseWithReasoning;
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        role: "assistant",
        timestamp: new Date(),
        elapsed_ms: data.elapsed_ms ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
        input_tokens: data.usage?.prompt_tokens ?? 0, // NEW: input tokens from API
        output_tokens: data.usage?.completion_tokens ?? 0, // NEW: output tokens from API
        user_message_id: data.request_id, // NEW: link to user message that triggered this response
        model: data.model || model,
        contentType: data.contentType || "text",
        completion_id: data.id,
        reasoning: typeof respWithReasoning.reasoning === 'string' ? respWithReasoning.reasoning : undefined,
        reasoning_details: respWithReasoning.reasoning_details && Array.isArray(respWithReasoning.reasoning_details) ? respWithReasoning.reasoning_details : undefined,
  // Phase 2: non-persisted output images (data URLs) from API
  output_images: Array.isArray(data.output_images) ? data.output_images : undefined,
  requested_image_output: !!options?.imageOutput,
      };

  logger.debug('Created assistant message:', assistantMessage);
  logger.debug('Assistant message tokens:', {
        input_tokens: assistantMessage.input_tokens,
        output_tokens: assistantMessage.output_tokens,
        total_tokens: assistantMessage.total_tokens
      });

      // Update user message with input tokens when assistant response arrives
      setMessages(prev => {
  logger.debug('Token mapping debug:', {
          request_id: data.request_id,
          prompt_tokens: data.usage?.prompt_tokens,
          completion_tokens: data.usage?.completion_tokens,
          user_messages: prev.filter(m => m.role === 'user').map(m => ({ id: m.id, input_tokens: m.input_tokens }))
        });
        
        const updatedMessages = prev.map(msg =>
          msg.id === data.request_id
            ? { ...msg, input_tokens: data.usage?.prompt_tokens ?? 0 }
            : msg
        );
        return [...updatedMessages, assistantMessage];
      });
    } catch (err) {
      let chatError: ChatError;
      
      if (typeof err === 'object' && err !== null && 'message' in err) {
        // If it's already a ChatError object from our API response
        chatError = err as ChatError;
      } else {
        // If it's a generic error
        const errorMessage = err instanceof Error ? err.message : "An error occurred";
        chatError = {
          message: errorMessage,
          code: errorMessage.includes("fetch") ? "network_error" : "unknown_error",
        };
      }
      
      setError(chatError);
      
      // Mark the user message as failed
      setMessages(prev => prev.map(msg => 
        msg.id === userMessage.id ? { ...msg, error: true } : msg
      ));
      
  // Note: We no longer add a mock assistant message on errors.
  // The ErrorDisplay banner handles user-facing error feedback.
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearMessageError = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, error: false } : msg
    ));
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    clearError,
    clearMessageError,
  };
}
