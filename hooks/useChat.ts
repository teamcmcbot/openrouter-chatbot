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
      id: Date.now().toString(),
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: { message: string; model?: string } = { message: content };
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

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        role: "assistant",
        timestamp: new Date(),
        elapsed_time: data.elapsed_time ?? 0, // Assuming elapsed_time is part of the response
        total_tokens: data.usage?.total_tokens ?? 0, // Assuming usage is part of the response
        model: data.model || model, // Prefer backend model, fallback to selected
        contentType: data.contentType || "text", // Use detected content type from API
        completion_id: data.id, // Use OpenRouter response id for metadata lookup
      };

      setMessages(prev => [...prev, assistantMessage]);
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
