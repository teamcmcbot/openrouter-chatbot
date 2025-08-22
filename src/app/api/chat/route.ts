// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOpenRouterCompletion, fetchOpenRouterModels } from '../../../../lib/utils/openrouter';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../lib/utils/response';
import { logger } from '../../../../lib/utils/logger';
import { ChatResponse } from '../../../../lib/types';
import { OpenRouterRequest, OpenRouterContentBlock, OpenRouterUrlCitation } from '../../../../lib/types/openrouter';
import { AuthContext } from '../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../lib/middleware/auth';
import { withRedisRateLimitEnhanced } from '../../../../lib/middleware/redisRateLimitMiddleware';
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
  const reasoning: { effort?: 'low' | 'medium' | 'high' } | undefined = body?.reasoning && typeof body.reasoning === 'object'
      ? { effort: ['low','medium','high'].includes(body.reasoning.effort) ? body.reasoning.effort : 'low' }
      : undefined;

  const messages: OpenRouterRequest['messages'] = enhancedData.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // If images provided, validate modality, ownership and allowlist; mint signed URLs and append to last user message
    if (attachmentIds.length > 0) {
      if (!authContext.isAuthenticated || !authContext.user) {
        throw new ApiErrorResponse('Attachments require authentication', ErrorCode.AUTH_REQUIRED);
      }
      // Re-validate that selected model supports image input modality
      try {
        const requestedModelId: string = enhancedData.model;
        const models = await fetchOpenRouterModels();
        const model = models.find(m => m.id === requestedModelId);
        if (model && Array.isArray(model.architecture?.input_modalities) && !model.architecture.input_modalities.includes('image')) {
          throw new ApiErrorResponse('Selected model does not support image input', ErrorCode.BAD_REQUEST);
        }
      } catch (e) {
        if (e instanceof ApiErrorResponse) throw e;
        logger.warn('Model modality re-validation skipped (fetch failed or model not found)');
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

      // Attach image parts to the most recent user message in multimodal format
      const lastUserIndex = [...enhancedData.messages].reverse().findIndex(m => m.role === 'user');
      if (lastUserIndex !== -1) {
        const idx = enhancedData.messages.length - 1 - lastUserIndex;
        const userMsg = enhancedData.messages[idx];
        const contentBlocks: OpenRouterContentBlock[] = [];
        if (typeof userMsg.content === 'string' && userMsg.content.trim().length > 0) {
          contentBlocks.push({ type: 'text', text: userMsg.content });
        } else if (typeof userMsg.content !== 'string' && Array.isArray(userMsg.content)) {
          // If upstream already provided blocks, start with them
          contentBlocks.push(...(userMsg.content as OpenRouterContentBlock[]));
        }
        for (const url of signedUrls) {
          contentBlocks.push({ type: 'image_url', image_url: { url } });
        }
        messages[idx] = { role: 'user', content: contentBlocks };
      }
      logger.info('Chat send with attachments', {
        userId: authContext.user.id,
        model: enhancedData.model,
        attachments_count: attachmentIds.length,
        draft_id: body.draftId,
      });
    }
    
  // Phase 2: Log request format for human verification
    console.log(`[Chat API] Request format: ${body.messages ? 'NEW' : 'LEGACY'}`);
    console.log(`[Chat API] Message count: ${messages.length} messages`);
    console.log(`[Chat API] Current message: "${body.message}"`);
    console.log(`[Chat API] User tier: ${authContext.profile?.subscription_tier || 'anonymous'}`);
  console.log(`[Chat API] Web search enabled: ${!!body.webSearch}`);
  console.log(`[Chat API] Reasoning requested: ${!!reasoning} ${reasoning ? `(effort=${reasoning.effort})` : ''}`);

    // Tier gating for Web Search (Pro/Enterprise only)
    // Anonymous and Free are both forbidden for this feature
    if (body.webSearch) {
      const tier = authContext.profile?.subscription_tier || 'anonymous';
      if (!authContext.isAuthenticated || tier === 'free') {
        throw new ApiErrorResponse('Web Search is available for Pro and Enterprise plans', ErrorCode.FORBIDDEN);
      }
    }

    // Enterprise gating for reasoning
    if (reasoning) {
      const tier = authContext.profile?.subscription_tier;
      if (tier !== 'enterprise') {
        throw new ApiErrorResponse('Reasoning is available for enterprise accounts only', ErrorCode.FORBIDDEN);
      }
      // Re-validate model supports reasoning
      try {
        const requestedModelId: string = enhancedData.model;
        const models = await fetchOpenRouterModels();
        const model = models.find(m => m.id === requestedModelId);
        const supported = Array.isArray(model?.supported_parameters) && (model!.supported_parameters.includes('reasoning') || model!.supported_parameters.includes('include_reasoning'));
        if (!supported) {
          throw new ApiErrorResponse('Selected model does not support reasoning', ErrorCode.BAD_REQUEST);
        }
      } catch (e) {
        if (e instanceof ApiErrorResponse) throw e;
        logger.warn('Model reasoning support re-validation skipped (fetch failed or model not found)');
      }
    }
    
  // Phase 4: Calculate model-aware max tokens
    const tokenStrategy = await getModelTokenLimits(enhancedData.model);
    const dynamicMaxTokens = tokenStrategy.maxOutputTokens;
    
    console.log(`[Chat API] Model: ${enhancedData.model}`);
    console.log(`[Chat API] Token strategy - Input: ${tokenStrategy.maxInputTokens}, Output: ${tokenStrategy.maxOutputTokens}`);
    console.log(`[Chat API] Using dynamic max_tokens: ${dynamicMaxTokens} (calculated from model limits)`);
    
    // Additional validation for token limits based on user tier
    const totalInputTokens = messages.reduce((total, msg) => {
      const text = Array.isArray(msg.content)
        ? (msg.content as OpenRouterContentBlock[])
            .map((b) => (b.type === 'text' ? b.text : ''))
            .join(' ')
        : String(msg.content || '');
      return total + estimateTokenCount(text);
    }, 0);
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
      authContext,
      { webSearch: !!body.webSearch, webMaxResults: 3, reasoning }
    );
    logger.debug('OpenRouter response received:', openRouterResponse);
  const assistantResponse = openRouterResponse.choices[0].message.content;
  // Some providers may include reasoning/thinking text in non-standard fields; map if available
  type MaybeReasoningMessage = { choices?: { message?: { reasoning?: string } }[]; reasoning?: Record<string, unknown> };
  const maybe = openRouterResponse as unknown as MaybeReasoningMessage;
  const reasoningText = maybe?.choices?.[0]?.message?.reasoning;
  const reasoningDetails = maybe?.reasoning;
    const usage = openRouterResponse.usage;
  const rawAnnotations = openRouterResponse?.choices?.[0]?.message?.annotations ?? [];
  // Normalize annotations to a flat OpenRouterUrlCitation[] regardless of provider shape
  const annotations: OpenRouterUrlCitation[] = Array.isArray(rawAnnotations)
    ? (rawAnnotations
        .map((ann: unknown) => {
          if (!ann || typeof ann !== 'object') return null;
          const a = ann as Record<string, unknown>;
          // Already flat
          if (a.type === 'url_citation' && typeof a.url === 'string') {
            return a as unknown as OpenRouterUrlCitation;
          }
          // Nested provider shape: { type: 'url_citation', url_citation: { ... } }
          const nested = a.url_citation as Record<string, unknown> | undefined;
          if (a.type === 'url_citation' && nested && typeof nested.url === 'string') {
            const { url, title, content, start_index, end_index } = nested as {
              url: string; title?: string; content?: string; start_index?: number; end_index?: number;
            };
            return { type: 'url_citation', url, title, content, start_index, end_index } satisfies OpenRouterUrlCitation;
          }
          // Fallback: objects with URL but missing type
          if (typeof a.url === 'string' && !a.type) {
            const { url, title, content, start_index, end_index } = a as {
              url: string; title?: string; content?: string; start_index?: number; end_index?: number;
            };
            return { type: 'url_citation', url, title, content, start_index, end_index } satisfies OpenRouterUrlCitation;
          }
          return null;
        })
        .filter((x): x is OpenRouterUrlCitation => !!x))
    : [];

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
      contentType: "markdown", // Always use markdown rendering for consistent experience
      id: openRouterResponse.id, // Pass OpenRouter response id to ChatResponse
    };
  if (typeof reasoningText === 'string' && reasoningText.length > 0) response.reasoning = reasoningText;
  if (reasoningDetails && typeof reasoningDetails === 'object') response.reasoning_details = reasoningDetails;
  // Attach annotations if present (for future UI rendering); ignored by client if unknown
  response.annotations = annotations;
  // Echo web search activation for persistence layer
  response.has_websearch = !!body.webSearch;
  response.websearch_result_count = Array.isArray(annotations) ? annotations.length : 0;

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

// Apply enhanced authentication middleware with tiered rate limiting
export const POST = withEnhancedAuth(
  withRedisRateLimitEnhanced(chatHandler, { tier: "tierA" })
);
