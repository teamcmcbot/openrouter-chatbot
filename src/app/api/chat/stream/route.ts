// src/app/api/chat/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTextStreamResponse } from 'ai';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { logger } from '../../../../../lib/utils/logger';
import { detectMarkdownContent } from '../../../../../lib/utils/markdown';
import { AuthContext } from '../../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { estimateTokenCount, getModelTokenLimits } from '../../../../../lib/utils/tokens';
import { createClient } from '../../../../../lib/supabase/server';
import { getOpenRouterCompletionStream } from '../../../../../lib/utils/openrouter';

// Configure extended timeout for streaming requests
export const maxDuration = 300; // 5 minutes for reasoning mode and slow models

async function chatStreamHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  logger.info('Chat stream request received', {
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier
  });
  
  try {
    const body = await request.json();
    
    // Create request data structure for validation (same as non-streaming)
    const requestData = {
      messages: body.messages || [{ role: 'user', content: body.message }],
      model: body.model || process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free',
      temperature: body.temperature,
      systemPrompt: body.systemPrompt
    };

    // Validate request with authentication context (same validation as non-streaming)
    const validation = validateChatRequestWithAuth(requestData, authContext);

    if (!validation.valid) {
      logger.warn('Chat stream request validation failed:', validation.errors);
      throw new ApiErrorResponse(
        validation.errors.join('; '),
        ErrorCode.BAD_REQUEST
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      logger.info('Chat stream request warnings:', validation.warnings);
    }

    // Use enhanced data with applied feature flags
    const enhancedData = validation.enhancedData;
    
    logger.debug('Enhanced chat stream request data:', {
      model: enhancedData.model,
      messageCount: enhancedData.messages.length,
      hasTemperature: !!enhancedData.temperature,
      hasSystemPrompt: !!enhancedData.systemPrompt,
      streaming: true
    });

    // All the same validation logic as non-streaming endpoint
    const supabase = await createClient();

    const attachmentIds: string[] = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    const reasoning: { effort?: 'low' | 'medium' | 'high' } | undefined = body?.reasoning && typeof body.reasoning === 'object'
      ? { effort: ['low','medium','high'].includes(body.reasoning.effort) ? body.reasoning.effort : 'low' }
      : undefined;

    // Handle attachments validation (same logic as non-streaming)
    if (attachmentIds.length > 0) {
      if (!authContext.isAuthenticated || !authContext.user) {
        throw new ApiErrorResponse('Attachments require authentication', ErrorCode.AUTH_REQUIRED);
      }
      
      // Fetch and validate attachments
      const { data: atts, error } = await supabase
        .from('chat_attachments')
        .select('*')
        .in('id', attachmentIds)
        .eq('user_id', authContext.user.id)
        .eq('status', 'ready');
      
      if (error) throw error;
      if (!atts || atts.length !== attachmentIds.length) {
        throw new ApiErrorResponse('Some attachments not found', ErrorCode.NOT_FOUND);
      }
      
      if (atts.length > 3) {
        throw new ApiErrorResponse('Attachment limit exceeded (max 3)', ErrorCode.BAD_REQUEST);
      }
      
      // Check MIME allowlist
      const invalid = atts.find(a => !['image/png','image/jpeg','image/webp'].includes(a.mime));
      if (invalid) {
        throw new ApiErrorResponse('Unsupported attachment type', ErrorCode.BAD_REQUEST);
      }
    }

    // Web Search tier gating (same as non-streaming)
    if (body.webSearch) {
      const tier = authContext.profile?.subscription_tier || 'anonymous';
      if (!authContext.isAuthenticated || tier === 'free') {
        throw new ApiErrorResponse('Web Search is available for Pro and Enterprise plans', ErrorCode.FORBIDDEN);
      }
    }

    // Enterprise gating for reasoning (same as non-streaming)
    if (reasoning) {
      const tier = authContext.profile?.subscription_tier;
      if (tier !== 'enterprise') {
        throw new ApiErrorResponse('Reasoning is available for enterprise accounts only', ErrorCode.FORBIDDEN);
      }
    }

    // Token validation (same as non-streaming)
    const tokenStrategy = await getModelTokenLimits(enhancedData.model);
    const dynamicMaxTokens = tokenStrategy.maxOutputTokens;
    
    console.log(`[Chat Stream API] Model: ${enhancedData.model}`);
    console.log(`[Chat Stream API] Token strategy - Input: ${tokenStrategy.maxInputTokens}, Output: ${tokenStrategy.maxOutputTokens}`);
    console.log(`[Chat Stream API] Using dynamic max_tokens: ${dynamicMaxTokens} (calculated from model limits)`);
    
    const totalInputTokens = enhancedData.messages.reduce((total, msg) => {
      return total + estimateTokenCount(String(msg.content || ''));
    }, 0);
    
    const tokenValidation = validateRequestLimits(totalInputTokens, authContext.features);
    
    if (!tokenValidation.allowed) {
      throw new ApiErrorResponse(
        tokenValidation.reason || 'Request exceeds token limits',
        ErrorCode.TOKEN_LIMIT_EXCEEDED
      );
    }

    // Log streaming request format
    console.log(`[Chat Stream API] Request format: ${body.messages ? 'NEW' : 'LEGACY'}`);
    console.log(`[Chat Stream API] Message count: ${enhancedData.messages.length} messages`);
    console.log(`[Chat Stream API] User tier: ${authContext.profile?.subscription_tier || 'anonymous'}`);
    console.log(`[Chat Stream API] Web search enabled: ${!!body.webSearch}`);
    console.log(`[Chat Stream API] Reasoning requested: ${!!reasoning} ${reasoning ? `(effort=${reasoning.effort})` : ''}`);

    const startTime = Date.now();

    // Convert messages to OpenRouter format
    const messages = enhancedData.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // Get streaming response from OpenRouter
    const stream = await getOpenRouterCompletionStream(
      messages,
      enhancedData.model,
      dynamicMaxTokens,
      enhancedData.temperature,
      enhancedData.systemPrompt,
      authContext,
      { webSearch: !!body.webSearch, webMaxResults: 3, reasoning }
    );

    // Transform the OpenRouter stream to extract metadata and content
    let fullCompletion = '';
    let streamMetadata: {
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      id?: string;
      reasoning?: string;
      reasoning_details?: Record<string, unknown>;
      annotations?: {
        type: 'url_citation';
        url: string;
        title?: string;
        content?: string;
        start_index?: number;
        end_index?: number;
      }[];
    } = {};
    
    const textStream = new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        
        // Check for metadata chunks
        const metadataMatch = text.match(/__METADATA__([\s\S]*?)__END__/);
        if (metadataMatch) {
          try {
            const metadataChunk = JSON.parse(metadataMatch[1]);
            if (metadataChunk.type === 'metadata' && metadataChunk.data) {
              streamMetadata = metadataChunk.data;
              logger.debug('Extracted stream metadata:', streamMetadata);
            }
          } catch {
            // Ignore metadata parsing errors
          }
          // Don't forward metadata chunks to the client
          return;
        }
        
        // Forward content to the client and accumulate
        fullCompletion += text;
        controller.enqueue(text);
      },
      flush() {
        // Log completion when stream finishes
        const endTime = Date.now();
        const elapsedMs = endTime - startTime;
        
        logger.info('Chat stream completed', {
          userId: authContext.user?.id,
          model: enhancedData.model,
          elapsedMs,
          tier: authContext.profile?.subscription_tier,
          completionLength: fullCompletion.length,
          hasMarkdown: detectMarkdownContent(fullCompletion),
          usage: streamMetadata.usage,
          hasReasoning: !!streamMetadata.reasoning,
          annotationCount: streamMetadata.annotations?.length || 0,
        });
        
        // Store metadata for potential database sync
        // Note: In Phase 2, we'll need to make this metadata available to the frontend
        // for database sync purposes, potentially via a separate endpoint or headers
      }
    });

    // Pipe the OpenRouter stream through the transformer to get a text stream
    const textReadableStream = stream.pipeThrough(textStream);

    // Return the streaming text response using AI SDK v5
    const streamResponse = createTextStreamResponse({
      textStream: textReadableStream,
      headers: {
        'X-Streaming': 'true',
        'X-Model': enhancedData.model,
        'X-Request-ID': body.current_message_id || `stream_${Date.now()}`,
      }
    });

    // Convert to NextResponse to match middleware expectations
    return new NextResponse(streamResponse.body, {
      status: streamResponse.status,
      statusText: streamResponse.statusText,
      headers: streamResponse.headers,
    });

  } catch (error) {
    logger.error('Error processing chat stream request:', error);
    return handleError(error);
  }
}

// Apply enhanced authentication middleware with TierA rate limiting (same as /api/chat)
export const POST = withEnhancedAuth(
  withTieredRateLimit(chatStreamHandler, { tier: "tierA" })
);
