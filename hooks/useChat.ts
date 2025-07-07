"use client";

import { useState, useCallback } from "react";

interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, model?: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(errorData.error ?? `HTTP error! status: ${response.status}`);
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
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      
      // For development: Add a mock response when backend is not available
      if (errorMessage.includes("fetch")) {
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

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    clearError,
  };
}
