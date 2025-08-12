"use client";

import { useState, useCallback } from "react";
import { ChatMessage } from "../lib/types/chat";

interface ChatError {
  message: string;
  code?: string;
  suggestions?: string[];
  retryAfter?: number;
  timestamp?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null;
  sendMessage: (content: string, model?: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  clearMessageError: (messageId: string) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const sendMessage = useCallback(async (content: string, model?: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
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
      } = {
        message: content,
        messages: [userMessage], // Send the user message with its ID
        current_message_id: userMessage.id
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

      console.log('Raw API response data:', data);
      console.log('Usage object:', data.usage);
      console.log('Individual token values:', {
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        role: "assistant",
        timestamp: new Date(),
        elapsed_time: data.elapsed_time ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
        input_tokens: data.usage?.prompt_tokens ?? 0, // NEW: input tokens from API
        output_tokens: data.usage?.completion_tokens ?? 0, // NEW: output tokens from API
        user_message_id: data.request_id, // NEW: link to user message that triggered this response
        model: data.model || model,
        contentType: data.contentType || "text",
        completion_id: data.id,
      };

      console.log('Created assistant message:', assistantMessage);
      console.log('Assistant message tokens:', {
        input_tokens: assistantMessage.input_tokens,
        output_tokens: assistantMessage.output_tokens,
        total_tokens: assistantMessage.total_tokens
      });

      // Update user message with input tokens when assistant response arrives
      setMessages(prev => {
        console.log('Token mapping debug:', {
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
      
      // For development: Add a mock response when backend is not available
      if (chatError.code === "network_error") {
        const mockResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          content: "I'm currently not available. The backend API is being developed by Gemini CLI. Please check back later!",
          role: "assistant",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, mockResponse]);
      }
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
