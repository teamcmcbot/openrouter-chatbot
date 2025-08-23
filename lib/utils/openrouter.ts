// (root system prompt now loaded dynamically below)
  import fs from 'fs';
  import path from 'path';

  let cachedRootPrompt: string | null = null;

  function loadRootSystemPrompt(brand: string): string {
    if (cachedRootPrompt) return cachedRootPrompt.replace(/\{\{BRAND\}\}/g, brand);

    const fileEnv = process.env.OPENROUTER_ROOT_PROMPT_FILE?.trim();

    if (fileEnv) {
      const abs = path.isAbsolute(fileEnv) ? fileEnv : path.join(process.cwd(), fileEnv);
      if (fs.existsSync(abs)) {
        try {
          cachedRootPrompt = fs.readFileSync(abs, 'utf8');
        } catch (e) {
          console.warn(`[rootPrompt] Failed to read file '${abs}', falling back to minimal prompt:`, (e as Error).message);
        }
      } else {
        console.warn(`[rootPrompt] File '${abs}' not found. Falling back to minimal prompt.`);
      }
    }

    if (!cachedRootPrompt) {
      // Minimal default per new spec
      cachedRootPrompt = 'You are an AI assistant running inside the {{BRAND}} app.';
    }

    return cachedRootPrompt.replace(/\{\{BRAND\}\}/g, brand).replace(/\$\{brand\}/g, brand);
  }

  // Helper to prepend root and user system prompts
  function appendSystemPrompt(messages: OpenRouterMessage[], userSystemPrompt?: string): OpenRouterMessage[] {
    const brand = process.env.BRAND_NAME || 'YourBrand';
    const rootPrompt = loadRootSystemPrompt(brand);
    const systemMessages: OpenRouterMessage[] = [ { role: 'system', content: rootPrompt } ];
    if (userSystemPrompt) {
      systemMessages.push({ role: 'system', content: `USER CUSTOM PROMPT START: ${userSystemPrompt}.` });
    }
    const userMessages = messages.filter(m => m.role !== 'system');
    return [...systemMessages, ...userMessages];
  }
// lib/utils/openrouter.ts
import {
  OpenRouterResponse,
  OpenRouterModelsResponse,
  OpenRouterModel,
  ModelInfo,
  OpenRouterContentBlock,
} from '../types/openrouter';

// Redefine OpenRouterRequest here to allow 'system' role for internal use
type OpenRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenRouterContentBlock[];
};
type OpenRouterRequestWithSystem = {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  plugins?: { id: string; max_results?: number }[];
  // OpenRouter user tracking identifier (optional)
  user?: string;
};
import { ApiErrorResponse, ErrorCode } from './errors';
import { getEnvVar, isUserTrackingEnabled } from './env';
import { logger } from './logger';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_MODEL = process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free';
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS || '5000', 10);

interface OpenRouterError {
  error: {
    message: string;
    code: number;
    metadata?: {
      raw?: string;
      provider_name?: string;
      headers?: {
        'X-RateLimit-Limit'?: string;
        'X-RateLimit-Remaining'?: string;
        'X-RateLimit-Reset'?: string;
      };
    };
  };
  user_id?: string;
}

function getAlternativeModels(currentModel: string): string[] {
  try {
    const modelsList = getEnvVar('OPENROUTER_MODELS_LIST', '');
    if (!modelsList) return [];
    
    const allModels = modelsList.split(',').map(m => m.trim());
    return allModels.filter(model => model !== currentModel && model.includes(':free'));
  } catch {
    return ['google/gemini-2.0-flash-exp:free', 'openrouter/cypher-alpha:free', 'deepseek/deepseek-r1-0528:free'];
  }
}

/**
 * Get completion from OpenRouter API with automatic retry mechanism for "no content generated" scenarios
 *
 * This function implements a robust retry strategy to handle cases where OpenRouter returns HTTP 200
 * but with empty content, which typically occurs during:
 * - Model warming up from a cold start
 * - System scaling up to handle more requests
 *
 * Retry Strategy:
 * - Up to 3 retry attempts with exponential backoff (1-10 seconds)
 * - Jitter added to prevent thundering herd
 * - Only retries the same model (no automatic fallback)
 * - Provides helpful error messages with alternative model suggestions
 *
 * @param messages - Array of chat messages
 * @param model - Optional model ID (defaults to OPENROUTER_API_MODEL)
 * @param maxTokens - Optional max tokens (defaults to OPENROUTER_MAX_TOKENS)
 * @returns Promise<OpenRouterResponse> - The completion response
 * @throws ApiErrorResponse - With specific error codes and user-friendly suggestions
 */
import { AuthContext } from '../types/auth';

export async function getOpenRouterCompletion(
  messages: OpenRouterMessage[],
  model?: string,
  maxTokens?: number,
  temperature?: number,
  systemPrompt?: string,
  authContext?: AuthContext | null,
  options?: { webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' } }
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens = maxTokens ?? OPENROUTER_MAX_TOKENS;

  // Phase 2: Log request payload details for human verification
  // console.log(`[OpenRouter Request] Model: ${selectedModel}`);
  // console.log(`[OpenRouter Request] Messages: ${messages.length} messages`);
  // console.log(`[OpenRouter Request] Max Tokens: ${dynamicMaxTokens} (${maxTokens ? 'dynamic' : 'legacy default'})`);


  // Always prefer values from authContext.profile if present, else use provided, else default
  let finalTemperature = 0.7;
  let finalSystemPrompt: string | undefined = undefined;
  if (authContext?.profile) {
    if (typeof authContext.profile.temperature === 'number') {
      finalTemperature = authContext.profile.temperature;
    } else if (typeof temperature === 'number') {
      finalTemperature = temperature;
    }
    if (authContext.profile.system_prompt) {
      finalSystemPrompt = authContext.profile.system_prompt;
    } else if (systemPrompt) {
      finalSystemPrompt = systemPrompt;
    }
  } else {
    if (typeof temperature === 'number') {
      finalTemperature = temperature;
    }
    if (systemPrompt) {
      finalSystemPrompt = systemPrompt;
    }
  }

  // Always prepend root system prompt, and user's system prompt if provided
  const finalMessages: OpenRouterMessage[] = appendSystemPrompt(messages, finalSystemPrompt);

  type ReasoningOption = { effort?: 'low' | 'medium' | 'high' };
  type OpenRouterRequestWithReasoning = OpenRouterRequestWithSystem & { reasoning?: ReasoningOption };
  const requestBody: OpenRouterRequestWithReasoning = {
    model: selectedModel,
    messages: finalMessages,
    max_tokens: dynamicMaxTokens,
    temperature: finalTemperature,
  };

  // Attach user tracking if enabled and authenticated
  try {
    if (isUserTrackingEnabled() && authContext?.isAuthenticated && authContext.user?.id) {
      // Use the Supabase user id directly as per requirement
      requestBody.user = authContext.user.id;
      logger.debug('[OpenRouter Request] user tracking enabled', { user_present: true });
    } else {
      logger.debug('[OpenRouter Request] user tracking disabled or unauthenticated', {
        enabled: isUserTrackingEnabled(),
        isAuthenticated: !!authContext?.isAuthenticated,
      });
    }
  } catch (e) {
    // Never fail the request due to user tracking wiring
    logger.warn('Failed to attach user tracking to OpenRouter request (continuing without user):', e);
  }

  // Enable OpenRouter web search plugin when requested
  if (options?.webSearch) {
    const maxResults = Number.isFinite(options.webMaxResults as number)
      ? Math.max(1, Math.min(10, Math.trunc(options.webMaxResults as number)))
      : 3; // default per spec
    requestBody.plugins = [{ id: 'web', max_results: maxResults }];
    // console.log(`[OpenRouter Request] Web search enabled (max_results=${maxResults})`);
  }
  // Forward unified reasoning option if provided and user is enterprise (checked upstream)
  if (options?.reasoning) {
    // Attach to request; OpenRouter will normalize per provider
    requestBody.reasoning = options.reasoning;
    // console.log(`[OpenRouter Request] Reasoning enabled (effort=${options.reasoning.effort || 'low'})`);
  }
  logger.debug('OpenRouter request body:', requestBody);

  let lastError: Error | null = null;

  // Retry loop for handling "no content generated" scenarios
  for (let attempt = 0; attempt <= COMPLETION_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      logger.info(`OpenRouter completion request (attempt ${attempt + 1}/${COMPLETION_RETRY_CONFIG.maxRetries + 1}) for model: ${selectedModel}`);

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let parsedError: OpenRouterError | null = null;
        
        try {
          parsedError = JSON.parse(errorBody) as OpenRouterError;
        } catch {
          // If parsing fails, use the raw error body
        }

        // Handle specific error cases
        if (response.status === 429) {
          const isUpstreamRateLimit = parsedError?.error?.metadata?.raw?.includes('rate-limited upstream');
          const providerName = parsedError?.error?.metadata?.provider_name || 'Unknown';
          const rateLimitRemaining = parsedError?.error?.metadata?.headers?.['X-RateLimit-Remaining'];
          const rateLimitReset = parsedError?.error?.metadata?.headers?.['X-RateLimit-Reset'];
          
          // Check if this is a rate limit with 0 remaining requests
          const isRateLimitExceeded = rateLimitRemaining === '0';
          
          if (isRateLimitExceeded && rateLimitReset) {
            const resetTime = new Date(parseInt(rateLimitReset));
            const now = new Date();
            const timeUntilReset = Math.max(0, Math.ceil((resetTime.getTime() - now.getTime()) / 1000));
            const hoursUntilReset = Math.floor(timeUntilReset / 3600);
            const minutesUntilReset = Math.floor((timeUntilReset % 3600) / 60);
            
            let resetMessage = '';
            if (hoursUntilReset > 0) {
              resetMessage = `Rate limit will reset in ${hoursUntilReset} hour${hoursUntilReset > 1 ? 's' : ''} and ${minutesUntilReset} minute${minutesUntilReset > 1 ? 's' : ''}.`;
            } else if (minutesUntilReset > 0) {
              resetMessage = `Rate limit will reset in ${minutesUntilReset} minute${minutesUntilReset > 1 ? 's' : ''}.`;
            } else {
              resetMessage = 'Rate limit should reset shortly.';
            }
            
            const alternativeModels = getAlternativeModels(selectedModel);
            const suggestions = [
              resetMessage,
              'Switch to a different model from the dropdown',
            ];
            
            // Add specific model suggestions if available
            if (alternativeModels.length > 0) {
              suggestions.splice(1, 1, `Try one of these alternative models: ${alternativeModels.slice(0, 3).join(', ')}`);
            }
            
            const errorMessage = parsedError?.error?.message || 'Rate limit exceeded.';
            throw new ApiErrorResponse(
              `${errorMessage} ${resetMessage}`,
              ErrorCode.TOO_MANY_REQUESTS,
              parsedError?.error?.metadata?.raw || errorBody,
              timeUntilReset > 0 ? timeUntilReset : 60,
              suggestions
            );
          } else if (isUpstreamRateLimit) {
            const alternativeModels = getAlternativeModels(selectedModel);
            const suggestions = [
              'Try again in a few minutes',
              'Switch to a different model from the dropdown',
            ];
            
            // Add specific model suggestions if available
            if (alternativeModels.length > 0) {
              suggestions.splice(1, 1, `Try one of these alternative models: ${alternativeModels.slice(0, 3).join(', ')}`);
            }
            
            throw new ApiErrorResponse(
              `The ${providerName} model is temporarily rate-limited. Please try again in a few moments or switch to a different model.`,
              ErrorCode.TOO_MANY_REQUESTS,
              parsedError?.error?.metadata?.raw,
              60, // Suggest retrying after 60 seconds
              suggestions
            );
          } else {
            throw new ApiErrorResponse(
              'Too many requests. Please wait a moment before trying again.',
              ErrorCode.TOO_MANY_REQUESTS,
              errorBody,
              30, // Suggest retrying after 30 seconds
              ['Wait a moment before sending another message', 'Try using a different model']
            );
          }
        }

        // Handle other HTTP errors
        const errorMessage = parsedError?.error?.message || `OpenRouter API error: ${response.status} ${response.statusText}`;
        const errorCode = response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST;
        
        throw new ApiErrorResponse(errorMessage, errorCode, errorBody);
      }

      const jsonResponse = await response.json();

      // Check for JSON-level errors (OpenRouter's soft error pattern)
      // OpenRouter returns HTTP 200 OK even for errors, with error details in JSON body
      if (jsonResponse.error) {
        const errorMessage = jsonResponse.error.message || 'Unknown error from OpenRouter';
        const errorCode = jsonResponse.error.code >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST;
        
        logger.error('OpenRouter JSON-level error detected:', {
          code: jsonResponse.error.code,
          message: jsonResponse.error.message,
          user_id: jsonResponse.user_id
        });
        
        throw new ApiErrorResponse(errorMessage, errorCode, JSON.stringify(jsonResponse));
      }

      // Check for "no content generated" scenario
      if (isNoContentGenerated(jsonResponse)) {
        const noContentError = new Error(`No content generated by model ${selectedModel} (attempt ${attempt + 1})`);
        lastError = noContentError;
        
        logger.warn(`No content generated on attempt ${attempt + 1}/${COMPLETION_RETRY_CONFIG.maxRetries + 1} for model: ${selectedModel}`);
        
        // If this is the last attempt, we'll throw an error after the loop
        if (attempt >= COMPLETION_RETRY_CONFIG.maxRetries) {
          break;
        }
        
        // Calculate delay and retry
        const delay = calculateCompletionRetryDelay(attempt);
        logger.info(`Retrying after ${delay}ms due to no content generated...`);
        await sleep(delay);
        continue;
      }

      // Success! Return the response
      logger.info(`Successfully received content from model ${selectedModel} on attempt ${attempt + 1}`);
      return jsonResponse;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors (rate limits, auth errors, etc.)
      if (error instanceof ApiErrorResponse) {
        if (error.code === ErrorCode.UNAUTHORIZED ||
            error.code === ErrorCode.FORBIDDEN ||
            error.code === ErrorCode.TOO_MANY_REQUESTS) {
          throw error;
        }
      }
      
      // If not the last attempt, continue to retry
      if (attempt < COMPLETION_RETRY_CONFIG.maxRetries) {
        const delay = calculateCompletionRetryDelay(attempt);
        logger.warn(`Error on completion attempt ${attempt + 1}, retrying after ${delay}ms:`, lastError.message);
        await sleep(delay);
        continue;
      }
    }
  }

  // If we've exhausted all retries due to no content generation
  if (lastError && lastError.message.includes('No content generated')) {
    const alternativeModels = getAlternativeModels(selectedModel);
    const suggestions = [
      'The model may be warming up from a cold start',
      'Try again in a few moments',
      'Switch to a different model from the dropdown',
    ];
    
    // Add specific model suggestions if available
    if (alternativeModels.length > 0) {
      suggestions.splice(2, 1, `Try one of these alternative models: ${alternativeModels.slice(0, 3).join(', ')}`);
    }
    
    throw new ApiErrorResponse(
      `Model ${selectedModel} failed to generate content after ${COMPLETION_RETRY_CONFIG.maxRetries + 1} attempts. This typically occurs when the model is warming up from a cold start.`,
      ErrorCode.SERVICE_UNAVAILABLE,
      lastError.message,
      60, // Suggest retrying after 60 seconds
      suggestions
    );
  }
  
  // If we've exhausted all retries due to other errors, throw the last error
  throw new ApiErrorResponse(
    `Failed to get completion after ${COMPLETION_RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`,
    ErrorCode.BAD_GATEWAY,
    lastError?.message
  );
}

// Retry configuration for models API
const MODELS_API_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  jitterFactor: 0.1,
};

// Retry configuration for chat completions API
// Handles "no content generated" scenarios that occur during model warm-up
// According to OpenRouter docs: warm-up times range from a few seconds to a few minutes
const COMPLETION_RETRY_CONFIG = {
  maxRetries: 3,        // Conservative retry count to balance reliability and response time
  baseDelay: 1000,      // 1 second base delay
  maxDelay: 10000,      // 10 seconds maximum delay
  jitterFactor: 0.1,    // 10% jitter to prevent thundering herd
};

// Sleep utility for retries
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to detect "no content generated" scenarios
// According to OpenRouter API docs, this occurs when:
// - The model is warming up from a cold start
// - The system is scaling up to handle more requests
// Returns true if the response has no content or only whitespace
function isNoContentGenerated(response: OpenRouterResponse): boolean {
  const content = response.choices?.[0]?.message?.content;
  return !content || content.trim() === '';
}

// Calculate delay with exponential backoff and jitter for models API
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    MODELS_API_RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    MODELS_API_RETRY_CONFIG.maxDelay
  );
  
  // Add jitter to avoid thundering herd
  const jitter = exponentialDelay * MODELS_API_RETRY_CONFIG.jitterFactor * Math.random();
  return exponentialDelay + jitter;
}

// Calculate delay with exponential backoff and jitter for completion API
function calculateCompletionRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    COMPLETION_RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    COMPLETION_RETRY_CONFIG.maxDelay
  );
  
  // Add jitter to avoid thundering herd
  const jitter = exponentialDelay * COMPLETION_RETRY_CONFIG.jitterFactor * Math.random();
  return exponentialDelay + jitter;
}

// Fetch models from OpenRouter API with proper error handling and retries
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const apiUrl = getEnvVar(
    'OPENROUTER_MODELS_API_URL',
    'https://openrouter.ai/api/v1/models'
  );

  if (!OPENROUTER_API_KEY) {
    throw new ApiErrorResponse(
      'OPENROUTER_API_KEY is not configured',
      ErrorCode.UNAUTHORIZED
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MODELS_API_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      logger.info(`Fetching OpenRouter models (attempt ${attempt + 1}/${MODELS_API_RETRY_CONFIG.maxRetries + 1})`);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'OpenRouter Chatbot',
          'User-Agent': 'OpenRouter-Chatbot/1.0',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          const rateLimitReset = response.headers.get('X-RateLimit-Reset');
          const retryAfter = response.headers.get('Retry-After');
          
          const delayMs = retryAfter 
            ? parseInt(retryAfter) * 1000 
            : rateLimitReset 
              ? Math.max(0, parseInt(rateLimitReset) * 1000 - Date.now())
              : calculateRetryDelay(attempt);
          
          if (attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
            logger.warn(`Rate limited, retrying after ${delayMs}ms`);
            await sleep(delayMs);
            continue;
          }
        }
        
        // Handle server errors with retry
        if (response.status >= 500 && attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
          const delay = calculateRetryDelay(attempt);
          logger.warn(`Server error ${response.status}, retrying after ${delay}ms`);
          await sleep(delay);
          continue;
        }
        
        throw new ApiErrorResponse(
          `OpenRouter API responded with ${response.status}: ${response.statusText}`,
          response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST,
          errorText
        );
      }

      const data: OpenRouterModelsResponse = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new ApiErrorResponse(
          'Invalid response format from OpenRouter API',
          ErrorCode.BAD_GATEWAY,
          JSON.stringify(data)
        );
      }

      logger.info(`Successfully fetched ${data.data.length} models from OpenRouter`);
      return data.data;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (error instanceof ApiErrorResponse) {
        if (error.code === ErrorCode.UNAUTHORIZED || error.code === ErrorCode.FORBIDDEN) {
          throw error;
        }
      }
      
      // If not the last attempt, continue to retry
      if (attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
        const delay = calculateRetryDelay(attempt);
        logger.warn(`Error fetching models, retrying after ${delay}ms:`, lastError.message);
        await sleep(delay);
        continue;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw new ApiErrorResponse(
    `Failed to fetch models after ${MODELS_API_RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`,
    ErrorCode.BAD_GATEWAY,
    lastError?.message
  );
}

// Transform OpenRouter model to ModelInfo for frontend consumption
export function transformOpenRouterModel(model: OpenRouterModel): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    context_length: model.context_length,
    pricing: {
      prompt: model.pricing.prompt,
      completion: model.pricing.completion,
      request: model.pricing.request,
      image: model.pricing.image,
      web_search: model.pricing.web_search,
      internal_reasoning: model.pricing.internal_reasoning,
      input_cache_read: model.pricing.input_cache_read,
      input_cache_write: model.pricing.input_cache_write,
    },
    input_modalities: model.architecture.input_modalities,
    output_modalities: model.architecture.output_modalities,
    supported_parameters: model.supported_parameters,
    created: model.created,
  };
}

// Transform database model_access row to ModelInfo for frontend consumption
export function transformDatabaseModel(row: {
  model_id: string;
  canonical_slug?: string;
  hugging_face_id?: string;
  model_name?: string;
  model_description?: string;
  context_length?: number;
  created_timestamp?: number;
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  tokenizer?: string;
  prompt_price?: string;
  completion_price?: string;
  request_price?: string;
  image_price?: string;
  web_search_price?: string;
  internal_reasoning_price?: string;
  input_cache_read_price?: string;
  input_cache_write_price?: string;
  max_completion_tokens?: number;
  is_moderated?: boolean;
  supported_parameters?: string[];
  status: string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
  daily_limit?: number;
  monthly_limit?: number;
  last_synced_at?: string;
  openrouter_last_seen?: string;
  created_at?: string;
  updated_at?: string;
}): ModelInfo {
  return {
    id: row.model_id,
    name: row.model_name || row.model_id,
    description: row.model_description || '',
    context_length: row.context_length || 8192,
    pricing: {
      prompt: row.prompt_price || '0',
      completion: row.completion_price || '0',
      request: row.request_price || '0',
      image: row.image_price || '0',
      web_search: row.web_search_price || '0',
      internal_reasoning: row.internal_reasoning_price || '0',
      input_cache_read: row.input_cache_read_price,
      input_cache_write: row.input_cache_write_price,
    },
    input_modalities: row.input_modalities || [],
    output_modalities: row.output_modalities || [],
    supported_parameters: row.supported_parameters || [],
    created: row.created_timestamp || Math.floor(Date.now() / 1000),
  };
}

// Filter models based on allowed list
export function filterAllowedModels(
  models: OpenRouterModel[], 
  allowedModels: string[]
): OpenRouterModel[] {
  if (allowedModels.length === 0) {
    logger.warn('No allowed models configured, returning all models');
    return models;
  }
  
  const filtered = models.filter(model => allowedModels.includes(model.id));
  logger.info(`Allowed list size: ${allowedModels.length}`);
  logger.info(`Filtered ${models.length} models to ${filtered.length} allowed models`);
  
  if (filtered.length === 0) {
    logger.warn('No models match the allowed list, this may cause issues');
  }
  
  return filtered;
}

/**
 * Get streaming completion from OpenRouter API
 * Returns a ReadableStream for use with Vercel AI SDK
 * 
 * @param messages - Array of chat messages
 * @param model - Model ID for OpenRouter
 * @param maxTokens - Maximum tokens to generate
 * @param temperature - Temperature for generation
 * @param systemPrompt - System prompt
 * @param authContext - Authentication context
 * @param options - Additional options (web search, reasoning, etc.)
 * @returns ReadableStream for streaming response
 */
export async function getOpenRouterCompletionStream(
  messages: OpenRouterMessage[],
  model?: string,
  maxTokens?: number,
  temperature?: number,
  systemPrompt?: string,
  authContext?: AuthContext | null,
  options?: { webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' } }
): Promise<ReadableStream> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens = maxTokens ?? OPENROUTER_MAX_TOKENS;

  // Use the same logic as non-streaming for temperature and system prompt
  let finalTemperature = 0.7;
  let finalSystemPrompt: string | undefined = undefined;
  if (authContext?.profile) {
    if (typeof authContext.profile.temperature === 'number') {
      finalTemperature = authContext.profile.temperature;
    } else if (typeof temperature === 'number') {
      finalTemperature = temperature;
    }
    if (authContext.profile.system_prompt) {
      finalSystemPrompt = authContext.profile.system_prompt;
    } else if (systemPrompt) {
      finalSystemPrompt = systemPrompt;
    }
  } else {
    if (typeof temperature === 'number') {
      finalTemperature = temperature;
    }
    if (systemPrompt) {
      finalSystemPrompt = systemPrompt;
    }
  }

  // Always prepend root system prompt, and user's system prompt if provided
  const finalMessages: OpenRouterMessage[] = appendSystemPrompt(messages, finalSystemPrompt);

  type ReasoningOption = { effort?: 'low' | 'medium' | 'high' };
  type OpenRouterRequestWithReasoning = OpenRouterRequestWithSystem & { reasoning?: ReasoningOption };
  const requestBody: OpenRouterRequestWithReasoning = {
    model: selectedModel,
    messages: finalMessages,
    max_tokens: dynamicMaxTokens,
    temperature: finalTemperature,
    stream: true, // Enable streaming
  };

  // Attach user tracking if enabled and authenticated
  try {
    if (isUserTrackingEnabled() && authContext?.isAuthenticated && authContext.user?.id) {
      requestBody.user = authContext.user.id;
      logger.debug('[OpenRouter Stream Request] user tracking enabled', { user_present: true });
    }
  } catch (e) {
    logger.warn('Failed to attach user tracking to OpenRouter stream request (continuing without user):', e);
  }

  // Enable OpenRouter web search plugin when requested
  if (options?.webSearch) {
    const maxResults = Number.isFinite(options.webMaxResults as number)
      ? Math.max(1, Math.min(10, Math.trunc(options.webMaxResults as number)))
      : 3;
    requestBody.plugins = [{ id: 'web', max_results: maxResults }];
    // console.log(`[OpenRouter Stream Request] Web search enabled (max_results=${maxResults})`);
  }
  
  // Forward reasoning option if provided
  if (options?.reasoning) {
    requestBody.reasoning = options.reasoning;
    // console.log(`[OpenRouter Stream Request] Reasoning enabled (effort=${options.reasoning.effort || 'low'})`);
  }

  logger.debug('OpenRouter stream request body:', { ...requestBody, stream: true });

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ApiErrorResponse(
      `OpenRouter streaming API error: ${response.status} ${response.statusText}`,
      response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST,
      errorBody
    );
  }

  if (!response.body) {
    throw new ApiErrorResponse(
      'No response body received from OpenRouter streaming API',
      ErrorCode.BAD_GATEWAY
    );
  }

  // Create a transformed stream that can capture metadata from the final chunks
  const streamMetadata: {
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    id?: string;
    reasoning?: string;
    reasoning_details?: Record<string, unknown>[];
    annotations?: {
      type: 'url_citation';
      url: string;
      title?: string;
      content?: string;
      start_index?: number;
      end_index?: number;
    }[];
  } = {};

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Log final captured metadata before sending
            // console.log('🟢 [OpenRouter Stream] Final metadata captured:', {
            //   hasUsage: !!streamMetadata.usage,
            //   hasId: !!streamMetadata.id,
            //   hasReasoning: !!streamMetadata.reasoning,
            //   hasAnnotations: !!streamMetadata.annotations,
            //   annotationsLength: streamMetadata.annotations?.length || 0,
            //   annotations: streamMetadata.annotations
            // });
            
            // Send a final metadata chunk that the streaming endpoint can capture
            const metadataChunk = JSON.stringify({
              type: 'metadata',
              data: streamMetadata
            });
            controller.enqueue(new TextEncoder().encode(`\n\n__METADATA__${metadataChunk}__END__\n\n`));
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              
              if (dataStr === '[DONE]') {
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                
                // Log the COMPLETE data structure to find hidden web search fields
                // console.log('🟡 [OpenRouter Stream] COMPLETE data chunk:', JSON.stringify(data, null, 2));
                
                // console.log('🟡 [OpenRouter Stream] Processing data chunk:', {
                //   hasUsage: !!data.usage,
                //   hasId: !!data.id,
                //   hasChoices: !!data.choices,
                //   hasAnnotations: !!(data.choices?.[0]?.message?.annotations),
                //   hasContent: !!(data.choices?.[0]?.delta?.content),
                //   choicesLength: data.choices?.length || 0,
                //   annotationsLength: data.choices?.[0]?.message?.annotations?.length || 0
                // });
                
                // Extract metadata from stream chunks
                if (data.usage) {
                  streamMetadata.usage = data.usage;
                  // console.log('🟢 [OpenRouter Stream] Captured usage:', streamMetadata.usage);
                }
                
                if (data.id) {
                  streamMetadata.id = data.id;
                  // console.log('🟢 [OpenRouter Stream] Captured ID:', streamMetadata.id);
                }
                
                // Extract reasoning data - OpenRouter sends this in delta, not message!
                if (data.choices?.[0]?.delta?.reasoning) {
                  // Accumulate reasoning content (streamed incrementally)
                  if (!streamMetadata.reasoning) streamMetadata.reasoning = '';
                  streamMetadata.reasoning += data.choices[0].delta.reasoning;
                  // console.log('🟢 [OpenRouter Stream] Captured DELTA reasoning chunk:', data.choices[0].delta.reasoning.substring(0, 100) + '...');
                  
                  // NEW: Forward reasoning chunk to frontend with special marker ONLY if it has content
                  const reasoningText = data.choices[0].delta.reasoning.trim();
                  if (reasoningText) {
                    const reasoningChunk = `__REASONING_CHUNK__${JSON.stringify({
                      type: 'reasoning',
                      data: data.choices[0].delta.reasoning
                    })}\n`;
                    controller.enqueue(new TextEncoder().encode(reasoningChunk));
                    // console.log('🟢 [OpenRouter Stream] Forwarded reasoning chunk to frontend:', data.choices[0].delta.reasoning.substring(0, 50) + '...');
                  } else {
                    // console.log('🟡 [OpenRouter Stream] Skipped empty reasoning chunk');
                  }
                }
                
                // if (data.choices?.[0]?.delta?.reasoning_details && Array.isArray(data.choices[0].delta.reasoning_details)) {
                //   // Accumulate reasoning_details (structured array that comes in chunks)
                //   if (!streamMetadata.reasoning_details) streamMetadata.reasoning_details = [];
                //   (streamMetadata.reasoning_details as Record<string, unknown>[]).push(...data.choices[0].delta.reasoning_details);
                //   console.log('🟢 [OpenRouter Stream] Captured DELTA reasoning_details:', data.choices[0].delta.reasoning_details);
                  
                //   // NEW: Forward reasoning details to frontend ONLY if array has content
                //   if (data.choices[0].delta.reasoning_details.length > 0) {
                //     const reasoningDetailsChunk = `__REASONING_DETAILS_CHUNK__${JSON.stringify({
                //       type: 'reasoning_details',
                //       data: data.choices[0].delta.reasoning_details
                //     })}\n`;
                //     controller.enqueue(new TextEncoder().encode(reasoningDetailsChunk));
                //     console.log('🟢 [OpenRouter Stream] Forwarded reasoning_details chunk to frontend:', data.choices[0].delta.reasoning_details.length, 'items');
                //   } else {
                //     console.log('🟡 [OpenRouter Stream] Skipped empty reasoning_details chunk');
                //   }
                // }
                
                // Fallback for final message reasoning (less common)
                if (data.choices?.[0]?.message?.reasoning) {
                  streamMetadata.reasoning = data.choices[0].message.reasoning;
                  // console.log('🟢 [OpenRouter Stream] Captured message reasoning:', streamMetadata.reasoning);
                }
                
                if (data.reasoning) {
                  streamMetadata.reasoning_details = data.reasoning;
                  // console.log('🟢 [OpenRouter Stream] Captured root reasoning details:', streamMetadata.reasoning_details);
                }
                
                // Extract annotations/citations - try multiple locations
                if (data.choices?.[0]?.message?.annotations) {
                  streamMetadata.annotations = data.choices[0].message.annotations;
                  // console.log('🟢 [OpenRouter Stream] Captured message annotations:', streamMetadata.annotations);
                }
                
                // CRITICAL FIX: OpenRouter sends annotations in delta, not message!
                if (data.choices?.[0]?.delta?.annotations) {
                  streamMetadata.annotations = data.choices[0].delta.annotations;
                  // console.log('🟢 [OpenRouter Stream] Captured DELTA annotations:', streamMetadata.annotations);
                }
                
                if (data.annotations) {
                  streamMetadata.annotations = data.annotations;
                  // console.log('🟢 [OpenRouter Stream] Captured root annotations:', streamMetadata.annotations);
                }
                
                // Check for web search results in other common locations
                if (data.choices?.[0]?.web_search_results) {
                  // console.log('🟡 [OpenRouter Stream] Found web_search_results:', data.choices[0].web_search_results);
                }
                
                if (data.web_search_results) {
                  // console.log('🟡 [OpenRouter Stream] Found root web_search_results:', data.web_search_results);
                }
                
                // Log any other interesting fields that might contain web search data
                if (data.choices?.[0]?.message && Object.keys(data.choices[0].message).length > 0) {
                  const messageKeys = Object.keys(data.choices[0].message);
                  if (messageKeys.some(key => !['content', 'role'].includes(key))) {
                    // console.log('🟡 [OpenRouter Stream] Message contains extra fields:', messageKeys);
                  }
                }
                
                // ENHANCED: Forward content chunks with embedded reasoning marker filtering
                if (data.choices?.[0]?.delta?.content) {
                  let contentChunk = data.choices[0].delta.content;
                  
                  // BACKEND FILTERING: Extract and remove embedded reasoning markers
                  const reasoningDetailsRegex = /__REASONING_DETAILS_CHUNK__\{[^}]*\}/g;
                  const reasoningChunkRegex = /__REASONING_CHUNK__\{[^}]*\}/g;
                  
                  // Extract embedded reasoning details before removing them
                  let match;
                  while ((match = reasoningDetailsRegex.exec(contentChunk)) !== null) {
                    try {
                      const embeddedData = JSON.parse(match[0].replace('__REASONING_DETAILS_CHUNK__', ''));
                      // Only forward if it has actual content
                      if (embeddedData.type === 'reasoning_details' && embeddedData.data && Array.isArray(embeddedData.data) && embeddedData.data.length > 0) {
                        const reasoningDetailsChunk = `__REASONING_DETAILS_CHUNK__${JSON.stringify(embeddedData)}\n`;
                        controller.enqueue(new TextEncoder().encode(reasoningDetailsChunk));
                        // console.log('🟢 [OpenRouter Stream] Extracted and forwarded embedded reasoning details:', embeddedData.data.length, 'items');
                      }
                    } catch (error) {
                      console.warn('🟡 [OpenRouter Stream] Failed to parse embedded reasoning details:', error);
                    }
                  }
                  
                  // Extract embedded reasoning chunks before removing them
                  reasoningChunkRegex.lastIndex = 0; // Reset regex
                  while ((match = reasoningChunkRegex.exec(contentChunk)) !== null) {
                    try {
                      const embeddedData = JSON.parse(match[0].replace('__REASONING_CHUNK__', ''));
                      // Only forward if it has actual content
                      if (embeddedData.type === 'reasoning' && embeddedData.data && typeof embeddedData.data === 'string' && embeddedData.data.trim()) {
                        const reasoningChunk = `__REASONING_CHUNK__${JSON.stringify(embeddedData)}\n`;
                        controller.enqueue(new TextEncoder().encode(reasoningChunk));
                        // console.log('🟢 [OpenRouter Stream] Extracted and forwarded embedded reasoning chunk:', embeddedData.data.substring(0, 50) + '...');
                      }
                    } catch (error) {
                      console.warn('🟡 [OpenRouter Stream] Failed to parse embedded reasoning chunk:', error);
                    }
                  }
                  
                  // CLEAN CONTENT: Remove all reasoning markers from content before forwarding
                  contentChunk = contentChunk
                    .replace(reasoningDetailsRegex, '')
                    .replace(reasoningChunkRegex, '');
                  
                  // Only forward content if there's actual content left after cleaning
                  if (contentChunk) {
                    controller.enqueue(new TextEncoder().encode(contentChunk));
                    // console.log('🟢 [OpenRouter Stream] Forwarded cleaned content chunk:', contentChunk.length, 'chars');
                  }
                }
              } catch {
                // Ignore JSON parsing errors for non-JSON chunks
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    }
  });
}
