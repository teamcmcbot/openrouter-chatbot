// lib/utils/openrouter.ts
import { OpenRouterRequest, OpenRouterResponse } from '../types/openrouter';
import { ApiErrorResponse, ErrorCode } from './errors';
import { getEnvVar } from './env';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_MODEL = process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free';

interface OpenRouterError {
  error: {
    message: string;
    code: number;
    metadata?: {
      raw?: string;
      provider_name?: string;
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
  model?: string
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const selectedModel = model ?? OPENROUTER_API_MODEL;

  const requestBody: OpenRouterRequest = {
    model: selectedModel,
    messages,
    max_tokens: 1000,
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
      
      if (isUpstreamRateLimit) {
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
