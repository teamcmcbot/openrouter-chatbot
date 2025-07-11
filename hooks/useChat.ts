"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatMessage } from "../lib/types/chat";
import { useChatHistory } from "./useChatHistory";

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
  retryLastMessage: (model?: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  clearMessageError: (messageId: string) => void;
  // New conversation management functions
  createNewConversation: () => void;
  loadConversation: (conversationId: string) => void;
  activeConversationId: string | null;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [lastLoadedConversationId, setLastLoadedConversationId] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // Chat history integration
  const {
    activeConversationId,
    createConversation,
    setActiveConversation,
    getActiveConversation,
    addMessageToConversation,
    updateConversationMessages,
    getConversationById,
  } = useChatHistory();

  // Load messages from active conversation only when conversation ID actually changes
  // and we're not currently sending a message
  useEffect(() => {
    if (activeConversationId !== lastLoadedConversationId && !isSendingMessage && !isLoading) {
      const activeConversation = getActiveConversation();
      if (activeConversation) {
        setMessages(activeConversation.messages);
      } else {
        setMessages([]);
      }
      setLastLoadedConversationId(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, lastLoadedConversationId, isSendingMessage, isLoading]); // Remove getActiveConversation from deps

  const sendMessage = useCallback(async (content: string, model?: string) => {
    if (!content.trim() || isLoading) return;

    setIsSendingMessage(true);

    // Ensure we have an active conversation
    let currentConversationId = activeConversationId;
    if (!currentConversationId) {
      const newConversation = createConversation();
      currentConversationId = newConversation.id;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
    };

    // Update local state immediately
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
        elapsed_time: data.elapsed_time ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
        model: data.model || model,
        contentType: data.contentType || "text",
        completion_id: data.id,
      };

      // Update local state first
      setMessages(prev => [...prev, assistantMessage]);
      
      // Sync both messages to history 
      if (currentConversationId) {
        addMessageToConversation(currentConversationId, userMessage);
        addMessageToConversation(currentConversationId, assistantMessage);
      }
      
    } catch (err) {
      let chatError: ChatError;
      
      if (typeof err === 'object' && err !== null && 'message' in err) {
        chatError = err as ChatError;
      } else {
        const errorMessage = err instanceof Error ? err.message : "An error occurred";
        chatError = {
          message: errorMessage,
          code: errorMessage.includes("fetch") ? "network_error" : "unknown_error",
        };
      }
      
      setError(chatError);
      
      // Mark the user message as failed in local state
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
        
        // Sync both messages to history
        if (currentConversationId) {
          addMessageToConversation(currentConversationId, userMessage);
          addMessageToConversation(currentConversationId, mockResponse);
        }
      }
    } finally {
      setIsLoading(false);
      setIsSendingMessage(false);
    }
  }, [isLoading, activeConversationId, createConversation, addMessageToConversation]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    // Also clear the active conversation messages
    if (activeConversationId) {
      updateConversationMessages(activeConversationId, []);
    }
  }, [activeConversationId, updateConversationMessages]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearMessageError = useCallback((messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, error: false } : msg
    ));
    
    // Also update in conversation history
    if (activeConversationId) {
      const conversation = getConversationById(activeConversationId);
      if (conversation) {
        const updatedMessages = conversation.messages.map(msg => 
          msg.id === messageId ? { ...msg, error: false } : msg
        );
        updateConversationMessages(activeConversationId, updatedMessages);
      }
    }
  }, [activeConversationId, getConversationById, updateConversationMessages]);

  const retryLastMessage = useCallback(async (model?: string) => {
    // Find the last user message
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    if (!lastUserMessage || isLoading) return;
    
    // Remove the failed message and retry
    setMessages(prev => prev.filter(msg => msg.id !== lastUserMessage.id));
    setError(null);
    
    // Also remove from conversation history
    if (activeConversationId) {
      const conversation = getConversationById(activeConversationId);
      if (conversation) {
        const filteredMessages = conversation.messages.filter(msg => msg.id !== lastUserMessage.id);
        updateConversationMessages(activeConversationId, filteredMessages);
      }
    }
    
    // Resend the message
    await sendMessage(lastUserMessage.content, model);
  }, [messages, isLoading, sendMessage, activeConversationId, getConversationById, updateConversationMessages]);

  const createNewConversation = useCallback(() => {
    createConversation();
    setMessages([]);
    setError(null);
  }, [createConversation]);

  const loadConversation = useCallback((conversationId: string) => {
    setActiveConversation(conversationId);
    setError(null);
    // Messages will be loaded automatically via useEffect
  }, [setActiveConversation]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    retryLastMessage,
    clearMessages,
    clearError,
    clearMessageError,
    createNewConversation,
    loadConversation,
    activeConversationId,
  };
}
