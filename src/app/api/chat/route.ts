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
import { createClient } from '../../../../lib/supabase/server';

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
    const supabase = await createClient();

  const attachmentIds: string[] = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];

    const messages: OpenRouterRequest['messages'] = enhancedData.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // If images provided, validate ownership and allowlist; mint signed URLs and append to last user message
    if (attachmentIds.length > 0) {
      if (!authContext.isAuthenticated || !authContext.user) {
        throw new ApiErrorResponse('Attachments require authentication', ErrorCode.AUTH_REQUIRED);
      }
      // Fetch attachments
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
      // Enforce ≤ 3
      if (atts.length > 3) {
        throw new ApiErrorResponse('Attachment limit exceeded (max 3)', ErrorCode.BAD_REQUEST);
      }
      // Check MIME allowlist
      const invalid = atts.find(a => !['image/png','image/jpeg','image/webp'].includes(a.mime));
      if (invalid) {
        throw new ApiErrorResponse('Unsupported attachment type', ErrorCode.BAD_REQUEST);
      }
      // Mint signed URLs
      const signedUrls: string[] = [];
      for (const a of atts) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(a.storage_bucket)
          .createSignedUrl(a.storage_path, 300);
        if (signErr || !signed?.signedUrl) {
          throw new ApiErrorResponse('Failed to create signed URL', ErrorCode.INTERNAL_SERVER_ERROR);
        }
        signedUrls.push(signed.signedUrl);
      }

      // Attach image parts to the most recent user message
      const lastUserIndex = [...enhancedData.messages].reverse().findIndex(m => m.role === 'user');
      if (lastUserIndex !== -1) {
        const idx = enhancedData.messages.length - 1 - lastUserIndex;
        const userMsg = enhancedData.messages[idx];
        // Compose multimodal content as text + images string (provider will accept input_image in later phase)
        // For now, append URLs to content to preserve intent; frontend can hide
        const appended = `\n\n[Attached images:]\n${signedUrls.map(u => `- ${u}`).join('\n')}`;
        messages[idx] = {
          role: 'user',
          content: `${userMsg.content}${appended}`
        };
      }
    }
    
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
    
  const startTime = Date.now();
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

  const endTime = Date.now();
  const elapsedMs = endTime - startTime; // integer milliseconds
  logger.debug('Measured assistant generation latency (ms):', elapsedMs);

    // Determine triggering user message ID (explicit > fallback)
    const explicitId: string | undefined = body.current_message_id;
    let triggeringUserId: string | undefined = explicitId;

    if (!triggeringUserId && Array.isArray(body.messages) && body.message) {
      // Fallback: use LAST matching user message with same trimmed content
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const m = body.messages[i];
        if (
          m && m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.trim() === body.message.trim()
        ) {
          triggeringUserId = m.id;
          break;
        }
      }
    }

    if (explicitId && !triggeringUserId) {
      type UserMsg = { id?: string; role?: string };
      logger.warn('Explicit current_message_id not found among provided messages', {
        explicitId,
        providedIds: Array.isArray(body.messages)
          ? (body.messages as UserMsg[])
              .filter((m) => m && m.role === 'user' && typeof m.id === 'string')
              .map((m) => m.id)
          : []
      });
    }

    const response: ChatResponse = {
      response: assistantResponse,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      request_id: triggeringUserId || undefined, // Deterministic linkage to triggering user message
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsedMs,
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
