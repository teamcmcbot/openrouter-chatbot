// stores/types/chat.ts

import { ChatMessage } from "../../lib/types/chat";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string; // ISO string for better serialization
  updatedAt: string; // ISO string for better serialization
  messageCount: number;
  totalTokens: number;
  lastModel?: string;
  isActive: boolean;
  lastMessagePreview?: string; // Last message content snippet for sidebar
  lastMessageTimestamp?: string; // ISO string timestamp of most recent message
}

export interface ChatError {
  message: string;
  code?: string;
  suggestions?: string[];
  retryAfter?: number;
  timestamp?: string;
}

export interface ChatState {
  // Core state
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: ChatError | null;
  isHydrated: boolean;

  // Actions
  createConversation: (title?: string) => string;
  switchConversation: (id: string) => void;
  sendMessage: (content: string, model?: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  clearCurrentMessages: () => void;
  clearError: () => void;
  clearMessageError: (messageId: string) => void;
  retryLastMessage: () => Promise<void>;
  getContextMessages: (maxTokens: number) => ChatMessage[]; // Phase 3: Context selection

  // Internal hydration handler
  _hasHydrated: () => void;
}

// Computed selectors
export interface ChatSelectors {
  getCurrentConversation: () => Conversation | null;
  getCurrentMessages: () => ChatMessage[];
  getConversationById: (id: string) => Conversation | null;
  getConversationCount: () => number;
  getTotalMessages: () => number;
  getRecentConversations: (limit?: number) => Conversation[];
}
