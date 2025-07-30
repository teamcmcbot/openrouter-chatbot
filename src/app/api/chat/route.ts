// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOpenRouterCompletion } from '../../../../lib/utils/openrouter';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../lib/utils/response';
import { logger } from '../../../../lib/utils/logger';
import { detectMarkdownContent } from '../../../../lib/utils/markdown';
import { ChatResponse } from '../../../../lib/types';
import { OpenRouterRequest } from '../../../../lib/types/openrouter';
import { AuthContext } from '../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../lib/middleware/auth';
import { withRateLimit } from '../../../../lib/middleware/rateLimitMiddleware';
import { estimateTokenCount, getModelTokenLimits } from '../../../../lib/utils/tokens';

async function chatHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  logger.info('Chat request received', {
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier
  });
  
  try {
    const body = await request.json();
    
    // Create request data structure for validation
    const requestData = {
      messages: body.messages || [{ role: 'user', content: body.message }],
      model: body.model || process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free',
      temperature: body.temperature,
      systemPrompt: body.systemPrompt
    };

    // Validate request with authentication context
    const validation = validateChatRequestWithAuth(requestData, authContext);

    if (!validation.valid) {
      logger.warn('Chat request validation failed:', validation.errors);
      throw new ApiErrorResponse(
        validation.errors.join('; '),
        ErrorCode.BAD_REQUEST
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      logger.info('Chat request warnings:', validation.warnings);
    }

    // Use enhanced data with applied feature flags
    const enhancedData = validation.enhancedData;
    
    logger.debug('Enhanced chat request data:', {
      model: enhancedData.model,
      messageCount: enhancedData.messages.length,
      hasTemperature: !!enhancedData.temperature,
      hasSystemPrompt: !!enhancedData.systemPrompt
    });

    // Phase 2: Support both old and new message formats
    const messages: OpenRouterRequest['messages'] = enhancedData.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    
    // Phase 2: Log request format for human verification
    console.log(`[Chat API] Request format: ${body.messages ? 'NEW' : 'LEGACY'}`);
    console.log(`[Chat API] Message count: ${messages.length} messages`);
    console.log(`[Chat API] Current message: "${body.message}"`);
    console.log(`[Chat API] User tier: ${authContext.profile?.subscription_tier || 'anonymous'}`);
    
    // Phase 4: Calculate model-aware max tokens
    const tokenStrategy = await getModelTokenLimits(enhancedData.model);
    const dynamicMaxTokens = tokenStrategy.maxOutputTokens;
    
    console.log(`[Chat API] Model: ${enhancedData.model}`);
    console.log(`[Chat API] Token strategy - Input: ${tokenStrategy.maxInputTokens}, Output: ${tokenStrategy.maxOutputTokens}`);
    console.log(`[Chat API] Using dynamic max_tokens: ${dynamicMaxTokens} (calculated from model limits)`);
    
    // Additional validation for token limits based on user tier
    const totalInputTokens = messages.reduce((total, msg) => total + estimateTokenCount(msg.content), 0);
    const tokenValidation = validateRequestLimits(totalInputTokens, authContext.features);
    
    if (!tokenValidation.allowed) {
      throw new ApiErrorResponse(
        tokenValidation.reason || 'Request exceeds token limits',
        ErrorCode.TOKEN_LIMIT_EXCEEDED
      );
    }
    
    const openRouterResponse = await getOpenRouterCompletion(
      messages,
      enhancedData.model,
      dynamicMaxTokens,
      enhancedData.temperature,
      enhancedData.systemPrompt,
      authContext
    );
    logger.debug('OpenRouter response received:', openRouterResponse);
    const assistantResponse = openRouterResponse.choices[0].message.content;
    const usage = openRouterResponse.usage;

    // Detect if the response contains markdown
    const hasMarkdown = detectMarkdownContent(assistantResponse);
    logger.debug('Markdown detection result:', hasMarkdown, 'for content:', assistantResponse.substring(0, 100));

    const now = Math.floor(Date.now() / 1000); // current time in seconds (epoch)
    logger.debug('Current time (epoch):', now);
    logger.debug('OpenRouter response created time (epoch):', openRouterResponse.created);

    const elapsedTime = now - openRouterResponse.created;
    logger.debug('Elapsed time for response:', elapsedTime, 'seconds');

    // Find the current user message that triggered this response
    // Match by content to ensure we link to the correct message
    const currentUserMessage = body.messages?.find((m: { role: string; content: string; id?: string }) =>
      m.role === 'user' && m.content.trim() === body.message.trim()
    );

    const response: ChatResponse = {
      response: assistantResponse,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      request_id: currentUserMessage?.id || undefined, // Link to the correct user message that triggered this response
      timestamp: new Date().toISOString(),
      elapsed_time: elapsedTime,
      contentType: hasMarkdown ? "markdown" : "text", // Add content type detection
      id: openRouterResponse.id, // Pass OpenRouter response id to ChatResponse
    };

    logger.info('Chat request successful', {
      userId: authContext.user?.id,
      model: enhancedData.model,
      tokens: usage.total_tokens,
      tier: authContext.profile?.subscription_tier
    });
    
    return createSuccessResponse(response);
  } catch (error) {
    logger.error('Error processing chat request:', error);
    return handleError(error);
  }
}

// Apply enhanced authentication middleware with rate limiting
export const POST = withEnhancedAuth((req: NextRequest, authContext: AuthContext) =>
  withRateLimit(chatHandler)(req, authContext)
);
