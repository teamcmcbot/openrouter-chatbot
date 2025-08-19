// lib/types/openrouter.ts

export type OpenRouterContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface OpenRouterRequest {
  model: string;
  messages: {
    role: "user" | "assistant";
    content: string | OpenRouterContentBlock[];
  }[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

// Annotations returned by OpenRouter (e.g., web search URL citations)
export interface OpenRouterUrlCitation {
  type: 'url_citation';
  url: string;
  title?: string;
  content?: string;
  start_index?: number;
  end_index?: number;
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
      annotations?: OpenRouterUrlCitation[];
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// OpenRouter Models API Types (Phase 1 Enhancement)

// OpenRouter API response wrapper
export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// Complete OpenRouter model interface (matches API v1 structure)
export interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    web_search: string;
    internal_reasoning: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: Record<string, unknown> | null;
  supported_parameters: string[];
}

// Simplified interface for frontend consumption
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  input_modalities: string[];
  output_modalities: string[];
  supported_parameters: string[];
  created: number;
}

// API response format (maintaining backward compatibility)
export interface ModelsResponse {
  models: ModelInfo[];
}

// Legacy response format for backward compatibility
export interface LegacyModelsResponse {
  models: string[];
}
