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
