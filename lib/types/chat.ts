// lib/types/chat.ts

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  model?: string;
  contentType?: "text" | "markdown"; // New field to specify content type
  completion_id?: string; // OpenRouter response id for metadata lookup
  error?: boolean; // Flag to indicate if this message failed to send
}

export interface ChatRequest {
  message: string;
  model?: string;
  preferMarkdown?: boolean; // New optional field
}

export interface ChatResponse {
  response: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  timestamp: string;
  elapsed_time: number;
  contentType?: "text" | "markdown"; // New field
  id: string; // OpenRouter response id for metadata lookup
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  totalTokens: number;
  lastModel?: string;
  isActive: boolean;
  lastMessagePreview?: string; // Last message content snippet for sidebar
  lastMessageTimestamp?: Date; // Timestamp of most recent message
}

export interface ChatHistoryState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  lastConversationId: string | null;
}

// Utility functions for conversation management
export function createNewConversation(initialTitle?: string): ChatConversation {
  const now = new Date();
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: initialTitle || `New Chat`,
    messages: [],
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    totalTokens: 0,
    isActive: false,
    lastMessagePreview: undefined,
    lastMessageTimestamp: undefined,
  };
}

export function updateConversationMetadata(conversation: ChatConversation): ChatConversation {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const totalTokens = conversation.messages.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0);
  const lastModel = conversation.messages
    .slice()
    .reverse()
    .find(msg => msg.model)?.model;

  return {
    ...conversation,
    messageCount: conversation.messages.length,
    totalTokens,
    lastModel,
    lastMessagePreview: lastMessage ? 
      lastMessage.content.length > 100 ? 
        lastMessage.content.substring(0, 100) + '...' : 
        lastMessage.content 
      : undefined,
    lastMessageTimestamp: lastMessage?.timestamp,
    updatedAt: new Date(),
  };
}

export function generateConversationTitle(firstUserMessage: string): string {
  // Auto-generate title from first user message
  const cleaned = firstUserMessage.trim();
  if (cleaned.length <= 50) {
    return cleaned;
  }
  
  // Find a good break point
  const truncated = cleaned.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 20) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}
