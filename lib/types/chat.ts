// lib/types/chat.ts

export interface ChatRequest {
  message: string;
  model?: string;
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
}
