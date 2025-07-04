// lib/types/chat.ts

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
}
