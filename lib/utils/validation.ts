// lib/utils/validation.ts

import { AuthContext, ModelAccessValidation, RequestLimitsValidation } from '../types/auth';
import { estimateTokenCount } from './tokens';
import { logger } from './logger';
import { ChatMessage } from '../types/chat';

/**
 * Type guard to check if value is a record
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if value has message property
 */
function hasMessage(value: Record<string, unknown>): value is Record<string, unknown> & { message: unknown } {
  return 'message' in value;
}

/**
 * Original validateChatRequest function for backward compatibility
 * Validates chat requests and supports both legacy and new message formats
 */
export function validateChatRequest(body: unknown): {
  data: {
    message: string;
    model: string;
    messages?: ChatMessage[];
  } | null;
  error: string | null;
} {
  try {
    // Type guard: ensure body is an object
    if (!isRecord(body)) {
      return {
        data: null,
        error: 'Request body must be an object.'
      };
    }

    // Type guard: ensure message exists
    if (!hasMessage(body)) {
      return {
        data: null,
        error: 'Message is required and must be a non-empty string.'
      };
    }

    // Validate required message field
    if (typeof body.message !== 'string' || body.message.trim() === '') {
      return {
        data: null,
        error: 'Message is required and must be a non-empty string.'
      };
    }

    // Check message length
    if (body.message.length > 4000) {
      return {
        data: null,
        error: 'Message cannot exceed 4000 characters.'
      };
    }

    // Get model (use default if not provided)
    const model = (typeof body.model === 'string' ? body.model : null) ||
                  process.env.OPENROUTER_API_MODEL ||
                  'deepseek/deepseek-r1-0528:free';

    // Validate messages array if provided (new format)
    let validatedMessages: ChatMessage[] | undefined;
    
    if ('messages' in body && body.messages) {
      if (Array.isArray(body.messages)) {
        // Validate each message in the array
        const isValidMessagesArray = body.messages.every((msg: unknown) => {
          if (!isRecord(msg)) return false;
          return (
            typeof msg.content === 'string' &&
            typeof msg.role === 'string' &&
            ['user', 'assistant', 'system'].includes(msg.role)
          );
        });

        if (isValidMessagesArray) {
          validatedMessages = body.messages as ChatMessage[];
          console.log('[Request Validation] Successfully validated ' + body.messages.length + ' context messages');
        } else {
          console.log('[Request Validation] Invalid messages array format, ignoring');
        }
      } else {
        console.log('[Request Validation] Invalid messages array format, ignoring');
      }
    } else {
      console.log('[Request Validation] No messages array provided, using single message format');
    }

    // Log the final format being used
    const format = validatedMessages ? 'NEW' : 'LEGACY';
    console.log(`[Request Validation] Final request: ${format} format with model: ${model}`);

    return {
      data: {
        message: body.message.trim(),
        model,
        messages: validatedMessages
      },
      error: null
    };

  } catch (error) {
    logger.error('Error validating chat request:', error);
    return {
      data: null,
      error: 'Failed to validate request'
    };
  }
}

/**
 * Validate if user has access to a specific model
 */
export function validateModelAccess(
  model: string,
  features: AuthContext['features']
): ModelAccessValidation {
  // If user has access to all models (enterprise tier)
  if (features.allowedModels.includes('*')) {
    return { allowed: true };
  }

  // Check if model is in allowed list
  if (features.allowedModels.includes(model)) {
    return { allowed: true };
  }

  // Check for pro models access
  const proModels = [
    'anthropic/claude-3-haiku',
    'openai/gpt-4o-mini',
    'google/gemini-pro',
  ];

  if (proModels.includes(model) && features.canUseProModels) {
    return { allowed: true };
  }

  // Check for enterprise models access
  const enterpriseModels = [
    'anthropic/claude-3-opus',
    'openai/gpt-4',
    'openai/gpt-4-turbo',
  ];

  if (enterpriseModels.includes(model) && features.canUseEnterpriseModels) {
    return { allowed: true };
  }

  // Model not allowed, provide fallback
  const fallbackModel = getFallbackModel(features);
  
  logger.warn(`Model ${model} not allowed for user, falling back to ${fallbackModel}`);
  
  return {
    allowed: false,
    fallbackModel,
    reason: `Model ${model} requires a higher subscription tier`,
  };
}

/**
 * Get appropriate fallback model based on user's features
 */
function getFallbackModel(features: AuthContext['features']): string {
  // Return the first allowed model as fallback
  if (features.allowedModels.length > 0 && features.allowedModels[0] !== '*') {
    return features.allowedModels[0];
  }
  
  // Default fallback
  return 'deepseek/deepseek-r1-0528:free';
}

/**
 * Validate request limits (token count, etc.)
 */
export function validateRequestLimits(
  tokenCount: number,
  features: AuthContext['features']
): RequestLimitsValidation {
  if (tokenCount > features.maxTokensPerRequest) {
    return {
      allowed: false,
      reason: `Request exceeds token limit of ${features.maxTokensPerRequest}`,
      maxTokens: features.maxTokensPerRequest,
      currentTokens: tokenCount,
    };
  }

  return { allowed: true };
}

/**
 * Validate message content and estimate tokens
 */
export function validateMessageContent(
  messages: Array<{ role: string; content: string }>,
  features: AuthContext['features']
): RequestLimitsValidation {
  try {
    // Estimate total token count for all messages
    const totalTokens = messages.reduce((total, message) => {
      return total + estimateTokenCount(message.content);
    }, 0);

    return validateRequestLimits(totalTokens, features);
  } catch (error) {
    logger.error('Error validating message content:', error);
    return {
      allowed: false,
      reason: 'Failed to validate message content',
    };
  }
}

/**
 * Validate system prompt modification
 */
export function validateSystemPromptAccess(features: AuthContext['features']): boolean {
  return features.canModifySystemPrompt;
}

/**
 * Validate temperature setting access
 */
export function validateTemperatureAccess(features: AuthContext['features']): boolean {
  return features.canUseCustomTemperature;
}

/**
 * Validate conversation sync access
 */
export function validateSyncAccess(features: AuthContext['features']): boolean {
  return features.canSyncConversations;
}

/**
 * Validate conversation save access
 */
export function validateSaveAccess(features: AuthContext['features']): boolean {
  return features.canSaveConversations;
}

/**
 * Validate export access
 */
export function validateExportAccess(features: AuthContext['features']): boolean {
  return features.canExportConversations;
}

/**
 * Validate analytics dashboard access
 */
export function validateAnalyticsAccess(features: AuthContext['features']): boolean {
  return features.hasAnalyticsDashboard;
}

/**
 * Get user's rate limit information
 */
export function getRateLimitInfo(features: AuthContext['features']) {
  return {
    maxRequestsPerHour: features.maxRequestsPerHour,
    maxTokensPerRequest: features.maxTokensPerRequest,
    hasRateLimitBypass: features.hasRateLimitBypass,
  };
}

/**
 * Comprehensive request validation
 */
export function validateChatRequestWithAuth(
  requestData: {
    messages: Array<{ role: string; content: string }>;
    model: string;
    temperature?: number;
    systemPrompt?: string;
  },
  authContext: AuthContext
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  enhancedData: typeof requestData;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enhancedData = { ...requestData };

  // Validate model access
  const modelValidation = validateModelAccess(requestData.model, authContext.features);
  if (!modelValidation.allowed) {
    if (modelValidation.fallbackModel) {
      enhancedData.model = modelValidation.fallbackModel;
      warnings.push(`Model changed to ${modelValidation.fallbackModel}: ${modelValidation.reason}`);
    } else {
      errors.push(modelValidation.reason || 'Model access denied');
    }
  }

  // Validate message content
  const contentValidation = validateMessageContent(requestData.messages, authContext.features);
  if (!contentValidation.allowed) {
    errors.push(contentValidation.reason || 'Message content validation failed');
  }

  // Validate temperature access
  if (requestData.temperature !== undefined && !validateTemperatureAccess(authContext.features)) {
    delete enhancedData.temperature;
    warnings.push('Custom temperature not allowed for your subscription tier');
  }

  // Validate system prompt access
  if (requestData.systemPrompt && !validateSystemPromptAccess(authContext.features)) {
    delete enhancedData.systemPrompt;
    warnings.push('Custom system prompt not allowed for your subscription tier');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    enhancedData,
  };
}
