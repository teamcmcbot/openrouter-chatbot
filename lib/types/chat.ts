// lib/types/chat.ts

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  input_tokens?: number;    // NEW: For user messages (prompt tokens)
  output_tokens?: number;   // NEW: For assistant messages (completion tokens)
  user_message_id?: string; // NEW: Links assistant response to user message
  model?: string;
  contentType?: "text" | "markdown"; // New field to specify content type
  completion_id?: string; // OpenRouter response id for metadata lookup
  error?: boolean; // Flag to indicate if this message failed to send
  error_message?: string; // Error message text
  error_code?: string; // Error code for categorization
  retry_after?: number; // Seconds to wait before retry
  suggestions?: string[]; // Alternative suggestions for failed requests
  originalModel?: string; // Store the model used when this message was originally sent (for retry purposes)
}

export interface ChatRequest {
  message: string;
  model?: string;
  preferMarkdown?: boolean; // New optional field
  messages?: ChatMessage[]; // NEW: Optional conversation context
}

export interface ChatResponse {
  response: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  request_id?: string; // NEW: Links response to user message that triggered it
  timestamp: string;
  elapsed_time: number;
  contentType?: "text" | "markdown"; // New field
  id: string; // OpenRouter response id for metadata lookup
}
