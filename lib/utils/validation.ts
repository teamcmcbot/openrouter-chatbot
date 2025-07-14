// lib/utils/validation.ts

import { ChatRequest, ChatMessage } from '../types';
import { logger } from './logger';
import { getEnvVar } from './env';

function isChatRequestBody(body: unknown): body is { message: string; model?: string; messages?: ChatMessage[] } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof (body as { message?: unknown }).message === 'string'
  );
}

function validateMessageArray(messages: unknown[]): ChatMessage[] | null {
  // Phase 2: Validate message array format
  if (!Array.isArray(messages)) {
    console.log('[Request Validation] Messages is not an array');
    return null;
  }

  for (const msg of messages) {
    if (
      typeof msg !== 'object' ||
      !msg ||
      !('role' in msg) ||
      !('content' in msg) ||
      !('id' in msg) ||
      !('timestamp' in msg)
    ) {
      console.log('[Request Validation] Invalid message structure:', msg);
      return null;
    }

    const msgObj = msg as Record<string, unknown>;
    if (
      typeof msgObj.role !== 'string' ||
      typeof msgObj.content !== 'string' ||
      !['user', 'assistant'].includes(msgObj.role)
    ) {
      console.log('[Request Validation] Invalid message format:', msg);
      return null;
    }
  }

  console.log(`[Request Validation] Validated ${messages.length} messages in array`);
  return messages as ChatMessage[];
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

  // Phase 2: Validate optional messages array
  let validatedMessages: ChatMessage[] | undefined;
  if ('messages' in body && body.messages) {
    const messageValidation = validateMessageArray(body.messages as unknown[]);
    if (messageValidation === null) {
      console.log('[Request Validation] Invalid messages array format, ignoring');
      // Don't fail the request, just ignore invalid messages array
      validatedMessages = undefined;
    } else {
      validatedMessages = messageValidation;
      console.log(`[Request Validation] Successfully validated ${validatedMessages.length} context messages`);
    }
  } else {
    console.log('[Request Validation] No messages array provided, using single message format');
  }

  const validatedModel = validateAndGetModel(body.model);

  const requestData: ChatRequest = { 
    message: body.message,
    model: validatedModel,
    messages: validatedMessages
  };

  console.log(`[Request Validation] Final request: ${validatedMessages ? 'NEW' : 'LEGACY'} format with model ${validatedModel}`);

  return { 
    data: requestData, 
    error: null 
  };
}
