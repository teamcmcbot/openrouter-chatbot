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
  ModelInfo
} from '../types/openrouter';

// Redefine OpenRouterRequest here to allow 'system' role for internal use
type OpenRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};
type OpenRouterRequestWithSystem = {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
};
import { ApiErrorResponse, ErrorCode } from './errors';
import { getEnvVar } from './env';
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
  authContext?: AuthContext | null
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens = maxTokens ?? OPENROUTER_MAX_TOKENS;

  // Phase 2: Log request payload details for human verification
  console.log(`[OpenRouter Request] Model: ${selectedModel}`);
  console.log(`[OpenRouter Request] Messages: ${messages.length} messages`);
  console.log(`[OpenRouter Request] Max Tokens: ${dynamicMaxTokens} (${maxTokens ? 'dynamic' : 'legacy default'})`);


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

  const requestBody: OpenRouterRequestWithSystem = {
    model: selectedModel,
    messages: finalMessages,
    max_tokens: dynamicMaxTokens,
    temperature: finalTemperature,
  };
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
