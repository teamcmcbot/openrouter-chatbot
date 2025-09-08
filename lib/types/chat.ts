// lib/types/chat.ts
import type { OpenRouterUrlCitation } from "../types/openrouter";

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  /** Assistant generation latency in milliseconds */
  elapsed_ms?: number;
  total_tokens?: number;
  input_tokens?: number;    // NEW: For user messages (prompt tokens)
  output_tokens?: number;   // NEW: For assistant messages (completion tokens)
  user_message_id?: string; // NEW: Links assistant response to user message
  model?: string;
  contentType?: "text" | "markdown"; // New field to specify content type
  completion_id?: string; // OpenRouter response id for metadata lookup
  // Reasoning metadata (assistant messages)
  reasoning?: string;
  reasoning_details?: Record<string, unknown>[];
  error?: boolean; // Flag to indicate if this message failed to send
  error_message?: string; // Error message text
  error_code?: string; // Error code for categorization
  // Upstream error fields (from OpenRouter) when available
  upstream_error_code?: number | string;
  upstream_error_message?: string;
  retry_after?: number; // Seconds to wait before retry
  suggestions?: string[]; // Alternative suggestions for failed requests
  originalModel?: string; // Store the model used when this message was originally sent (for retry purposes)
  /**
   * Whether the UI should offer a retry action for this failed user message.
   * - true (or undefined): retry is available (current-session failure)
   * - false: retry is NOT available (old/persisted failure loaded from server)
   */
  retry_available?: boolean;
  // Attachments metadata (linked on persistence)
  has_attachments?: boolean;
  attachment_ids?: string[];
  // Web search metadata (assistant messages)
  has_websearch?: boolean;
  websearch_result_count?: number;
  annotations?: OpenRouterUrlCitation[];
  // NEW: Store original streaming mode for retry purposes
  was_streaming?: boolean;

  // Request-side metadata (user messages only) to enable exact-option retries
  // These capture the options the user selected at send time and are not required server-side
  requested_web_search?: boolean;
  requested_web_max_results?: number;
  requested_reasoning_effort?: "low" | "medium" | "high";
  // Whether user requested assistant image output for this message (for exact-option retry)
  requested_image_output?: boolean;

  // Phase 2 (non-persisted) assistant output images (data URLs) for inline display only.
  // These are not stored in DB yet; will be replaced by attachments in Phase 2.5.
  output_images?: string[];
  /** Raw output image token count (from completion_tokens_details.image_tokens); persisted for pricing (assistant only). */
  output_image_tokens?: number;
  /** Number of output images generated (for database tracking when data URLs are removed). */
  output_image_count?: number;
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
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      image_tokens?: number;
    };
  };
  request_id?: string; // NEW: Links response to user message that triggered it
  timestamp: string;
  /** Assistant generation latency in milliseconds */
  elapsed_ms: number;
  contentType?: "text" | "markdown"; // New field
  id: string; // OpenRouter response id for metadata lookup
  // The resolved model used by the provider for this response (may differ from requested model)
  model?: string;
  annotations?: OpenRouterUrlCitation[]; // Optional URL citations from OpenRouter
  has_websearch?: boolean;
  websearch_result_count?: number;
  // Reasoning payload from provider if available
  reasoning?: string;
  reasoning_details?: Record<string, unknown>[];
  // Phase 2: temporary array of data URLs when image output requested (not persisted)
  output_images?: string[];
}
