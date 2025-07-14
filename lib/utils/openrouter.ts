// lib/utils/openrouter.ts
import { 
  OpenRouterRequest, 
  OpenRouterResponse, 
  OpenRouterModelsResponse, 
  OpenRouterModel, 
  ModelInfo 
} from '../types/openrouter';
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

export async function getOpenRouterCompletion(
  messages: OpenRouterRequest['messages'],
  model?: string,
  maxTokens?: number // NEW: dynamic max tokens
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

  const requestBody: OpenRouterRequest = {
    model: selectedModel,
    messages,
    max_tokens: dynamicMaxTokens, // NOW: Dynamic max tokens
    temperature: 0.7,
  };

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

  return response.json();
}

// Retry configuration for models API
const MODELS_API_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  jitterFactor: 0.1,
};

// Sleep utility for retries
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate delay with exponential backoff and jitter
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    MODELS_API_RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    MODELS_API_RETRY_CONFIG.maxDelay
  );
  
  // Add jitter to avoid thundering herd
  const jitter = exponentialDelay * MODELS_API_RETRY_CONFIG.jitterFactor * Math.random();
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
  
  logger.info(`Filtered ${models.length} models to ${filtered.length} allowed models`);
  
  if (filtered.length === 0) {
    logger.warn('No models match the allowed list, this may cause issues');
  }
  
  return filtered;
}
