"use client";

import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { 
  ChatConversation, 
  ChatMessage, 
  ChatHistoryState, 
  createNewConversation,
  updateConversationMetadata,
  generateConversationTitle 
} from "../lib/types/chat";

// Helper functions to handle Date serialization/deserialization
function serializeChatHistory(state: ChatHistoryState): ChatHistoryState {
  // JSON.stringify will convert Date objects to strings automatically
  return state;
}

function deserializeChatHistory(state: ChatHistoryState): ChatHistoryState {
  return {
    ...state,
    conversations: state.conversations.map(conv => ({
      ...conv,
      createdAt: new Date(conv.createdAt),
      updatedAt: new Date(conv.updatedAt),
      lastMessageTimestamp: conv.lastMessageTimestamp ? new Date(conv.lastMessageTimestamp) : undefined,
      messages: conv.messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    }))
  };
}

// Custom hook for chat history with proper date handling
function useChatHistoryStorage(key: string, initialValue: ChatHistoryState) {
  const [rawValue, setRawValue] = useLocalStorage(key, initialValue);
  
  // Deserialize dates when reading
  const value = useMemo(() => {
    if (!rawValue.conversations.length) return rawValue;
    return deserializeChatHistory(rawValue);
  }, [rawValue]);
  
  // Serialize dates when writing (JSON.stringify handles this automatically)
  const setValue = useCallback((newValue: ChatHistoryState | ((val: ChatHistoryState) => ChatHistoryState)) => {
    setRawValue(newValue);
  }, [setRawValue]);
  
  return [value, setValue] as const;
}

interface UseChatHistoryReturn {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  createConversation: (initialTitle?: string) => ChatConversation;
  createConversationWithMessages: (initialTitle?: string, messages?: ChatMessage[]) => ChatConversation;
  updateConversation: (conversationId: string, updates: Partial<ChatConversation>) => void;
  deleteConversation: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  getActiveConversation: () => ChatConversation | null;
  addMessageToConversation: (conversationId: string, message: ChatMessage) => void;
  addMessagesToConversation: (conversationId: string, messages: ChatMessage[]) => void;
  updateConversationMessages: (conversationId: string, messages: ChatMessage[]) => void;
  getConversationById: (conversationId: string) => ChatConversation | null;
  clearAllConversations: () => void;
}

const CHAT_HISTORY_KEY = "openrouter-chat-history";

export function useChatHistory(): UseChatHistoryReturn {
  const [chatHistoryState, setChatHistoryState] = useChatHistoryStorage(
    CHAT_HISTORY_KEY,
    {
      conversations: [],
      activeConversationId: null,
      lastConversationId: null,
    }
  );

  const createConversation = useCallback((initialTitle?: string): ChatConversation => {
    const newConversation = createNewConversation(initialTitle);
    
    setChatHistoryState(prev => ({
      ...prev,
      conversations: [newConversation, ...prev.conversations],
      activeConversationId: newConversation.id,
      lastConversationId: newConversation.id,
    }));

    return newConversation;
  }, [setChatHistoryState]);

  const createConversationWithMessages = useCallback((
    initialTitle?: string,
    messages: ChatMessage[] = []
  ): ChatConversation => {
    const newConversation = createNewConversation(initialTitle);
    
    // Add messages to the conversation before saving to state
    const conversationWithMessages = {
      ...newConversation,
      messages: [...newConversation.messages, ...messages]
    };
    
    // Auto-generate title from first user message if needed
    const firstUserMessage = messages.find(msg => msg.role === "user");
    if (conversationWithMessages.title === "New Chat" && firstUserMessage) {
      conversationWithMessages.title = generateConversationTitle(firstUserMessage.content);
    }
    
    const finalConversation = updateConversationMetadata(conversationWithMessages);
    
    setChatHistoryState(prev => ({
      ...prev,
      conversations: [finalConversation, ...prev.conversations],
      activeConversationId: finalConversation.id,
      lastConversationId: finalConversation.id,
    }));

    return finalConversation;
  }, [setChatHistoryState]);

  const updateConversation = useCallback((
    conversationId: string, 
    updates: Partial<ChatConversation>
  ) => {
    setChatHistoryState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => 
        conv.id === conversationId 
          ? updateConversationMetadata({ ...conv, ...updates })
          : conv
      ),
    }));
  }, [setChatHistoryState]);

  const deleteConversation = useCallback((conversationId: string) => {
    setChatHistoryState(prev => {
      const remainingConversations = prev.conversations.filter(conv => conv.id !== conversationId);
      const newActiveId = prev.activeConversationId === conversationId 
        ? (remainingConversations.length > 0 ? remainingConversations[0].id : null)
        : prev.activeConversationId;

      return {
        ...prev,
        conversations: remainingConversations,
        activeConversationId: newActiveId,
        lastConversationId: prev.lastConversationId === conversationId 
          ? newActiveId 
          : prev.lastConversationId,
      };
    });
  }, [setChatHistoryState]);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    setChatHistoryState(prev => {
      const updatedConversations = prev.conversations.map(conv => {
        if (conv.id === conversationId) {
          // Update the timestamp to move it to top and mark as active
          return {
            ...conv,
            isActive: true,
            updatedAt: new Date(), // This will move it to the top of the list
          };
        }
        return {
          ...conv,
          isActive: false,
        };
      });

      // Sort conversations by updatedAt (newest first)
      const sortedConversations = updatedConversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      return {
        ...prev,
        activeConversationId: conversationId,
        lastConversationId: conversationId || prev.lastConversationId,
        conversations: sortedConversations,
      };
    });
  }, [setChatHistoryState]);

  const getActiveConversation = useCallback((): ChatConversation | null => {
    if (!chatHistoryState.activeConversationId) return null;
    return chatHistoryState.conversations.find(
      conv => conv.id === chatHistoryState.activeConversationId
    ) || null;
  }, [chatHistoryState]);

  const getConversationById = useCallback((conversationId: string): ChatConversation | null => {
    return chatHistoryState.conversations.find(conv => conv.id === conversationId) || null;
  }, [chatHistoryState]);

  const addMessageToConversation = useCallback((
    conversationId: string, 
    message: ChatMessage
  ) => {
    setChatHistoryState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => {
        if (conv.id !== conversationId) return conv;
        
        const updatedConv = {
          ...conv,
          messages: [...conv.messages, message],
        };

        // Auto-generate title from first user message if title is still "New Chat"
        if (conv.title === "New Chat" && message.role === "user" && conv.messages.length === 0) {
          updatedConv.title = generateConversationTitle(message.content);
        }

        return updateConversationMetadata(updatedConv);
      }),
    }));
  }, [setChatHistoryState]);

  const addMessagesToConversation = useCallback((
    conversationId: string, 
    messages: ChatMessage[]
  ) => {
    setChatHistoryState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => {
        if (conv.id !== conversationId) return conv;
        
        const updatedConv = {
          ...conv,
          messages: [...conv.messages, ...messages],
        };

        // Auto-generate title from first user message if title is still "New Chat"
        const firstUserMessage = messages.find(msg => msg.role === "user");
        if (conv.title === "New Chat" && firstUserMessage && conv.messages.length === 0) {
          updatedConv.title = generateConversationTitle(firstUserMessage.content);
        }

        return updateConversationMetadata(updatedConv);
      }),
    }));
  }, [setChatHistoryState]);

  const updateConversationMessages = useCallback((
    conversationId: string, 
    messages: ChatMessage[]
  ) => {
    setChatHistoryState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => 
        conv.id === conversationId 
          ? updateConversationMetadata({ ...conv, messages })
          : conv
      ),
    }));
  }, [setChatHistoryState]);

  const clearAllConversations = useCallback(() => {
    setChatHistoryState({
      conversations: [],
      activeConversationId: null,
      lastConversationId: null,
    });
  }, [setChatHistoryState]);

  return {
    conversations: chatHistoryState.conversations,
    activeConversationId: chatHistoryState.activeConversationId,
    createConversation,
    createConversationWithMessages,
    updateConversation,
    deleteConversation,
    setActiveConversation,
    getActiveConversation,
    addMessageToConversation,
    addMessagesToConversation,
    updateConversationMessages,
    getConversationById,
    clearAllConversations,
  };
}
