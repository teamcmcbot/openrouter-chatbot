// lib/utils/validation.ts

import { ChatRequest } from '../types';
import { logger } from './logger';
import { getEnvVar } from './env';

function isChatRequestBody(body: unknown): body is { message: string; model?: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof (body as { message?: unknown }).message === 'string'
  );
}

function validateAndGetModel(requestModel?: string): string {
  const defaultModel = getEnvVar('OPENROUTER_API_MODEL');
  
  if (!requestModel) {
    logger.info('No model specified in request, using default model:', defaultModel);
    return defaultModel;
  }

  // Get allowed models from environment
  const allowedModelsEnv = getEnvVar('OPENROUTER_MODELS_LIST', '');
  const allowedModels = allowedModelsEnv
    .split(',')
    .map((model: string) => model.trim())
    .filter((model: string) => model.length > 0);

  // If no allowed models list is configured, allow any model
  if (allowedModels.length === 0) {
    logger.warn('OPENROUTER_MODELS_LIST not configured, allowing any model');
    return requestModel;
  }

  // Check if requested model is in allowed list
  if (allowedModels.includes(requestModel)) {
    logger.info('Using validated model from request:', requestModel);
    return requestModel;
  } else {
    logger.warn('Requested model not in allowed list:', {
      requestedModel: requestModel,
      allowedModels,
      defaultingTo: defaultModel
    });
    return defaultModel;
  }
}

export function validateChatRequest(body: unknown): { data: ChatRequest | null; error: string | null } {
  if (!isChatRequestBody(body) || body.message.trim().length === 0) {
    return { data: null, error: 'Message is required and must be a non-empty string.' };
  }

  if (body.message.length > 4000) {
    return { data: null, error: 'Message cannot exceed 4000 characters.' };
  }

  const validatedModel = validateAndGetModel(body.model);

  return { 
    data: { 
      message: body.message,
      model: validatedModel
    }, 
    error: null 
  };
}
