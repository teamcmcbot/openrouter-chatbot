// lib/types/openrouter.ts

export interface OpenRouterRequest {
  model: string;
  messages: {
    role: "user" | "assistant";
    content: string;
  }[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
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
