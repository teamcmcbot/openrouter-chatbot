// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOpenRouterCompletion, fetchOpenRouterModels } from '../../../../lib/utils/openrouter';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../lib/utils/response';
import { logger } from '../../../../lib/utils/logger';
import { ChatResponse } from '../../../../lib/types';
import extractOutputImageDataUrls from '../../../../lib/utils/parseOutputImages';
import { OpenRouterRequest, OpenRouterContentBlock, OpenRouterUrlCitation } from '../../../../lib/types/openrouter';
import { AuthContext } from '../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../lib/middleware/auth';
import { withRedisRateLimitEnhanced } from '../../../../lib/middleware/redisRateLimitMiddleware';
import { estimateTokenCount } from '../../../../lib/utils/tokens';
import { getModelTokenLimits } from '../../../../lib/utils/tokens.server';
import { MAX_MESSAGE_CHARS } from '../../../../lib/config/limits';
type SubscriptionTier = 'anonymous' | 'free' | 'pro' | 'enterprise';
import { createClient } from '../../../../lib/supabase/server';

async function chatHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  // Generate or forward a request id for correlation
  const forwardedId = request.headers.get('x-request-id') || request.headers.get('x-correlation-id');
  const requestId = forwardedId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  logger.info('Chat request received', {
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier,
    requestId,
  });
  // Track model for telemetry in error path
  let modelTag: string | undefined;
  
  try {
  const body = await request.json();
    
    // Create request data structure for validation
  const requestData = {
      messages: body.messages || [{ role: 'user', content: body.message }],
      model: body.model || process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free',
      temperature: body.temperature,
      systemPrompt: body.systemPrompt
    };
  modelTag = requestData.model;

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
  modelTag = enhancedData.model || modelTag;
    
    logger.debug('Enhanced chat request data:', {
      model: enhancedData.model,
      messageCount: enhancedData.messages.length,
      hasTemperature: !!enhancedData.temperature,
      hasSystemPrompt: !!enhancedData.systemPrompt,
      requestId,
    });

    // Phase 2: Support both old and new message formats
    const supabase = await createClient();

  const attachmentIds: string[] = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
  const reasoning: { effort?: 'low' | 'medium' | 'high' } | undefined = body?.reasoning && typeof body.reasoning === 'object'
      ? { effort: ['low','medium','high'].includes(body.reasoning.effort) ? body.reasoning.effort : 'low' }
      : undefined;
  const imageOutput: boolean = body?.imageOutput === true;

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
        requestId,
      });
    }
    
    // Enforce character limit on the triggering user message (text only)
    {
      const lastUser = [...enhancedData.messages].reverse().find((m) => m.role === 'user');
      let textLen = 0;
      if (lastUser) {
        if (typeof lastUser.content === 'string') {
          textLen = lastUser.content.length;
        } else if (Array.isArray(lastUser.content)) {
          textLen = (lastUser.content as OpenRouterContentBlock[])
            .reduce((acc, b) => {
              const anyB = b as unknown as { type?: string; text?: string };
              if (anyB && anyB.type === 'text' && typeof anyB.text === 'string') {
                return acc + anyB.text.length;
              }
              return acc;
            }, 0);
        }
      }
      if (textLen > MAX_MESSAGE_CHARS) {
        const overBy = textLen - MAX_MESSAGE_CHARS;
        const limitStr = MAX_MESSAGE_CHARS.toLocaleString();
        throw new ApiErrorResponse(
          `Message exceeds ${limitStr} character limit. Reduce by ${overBy} characters and try again.`,
          ErrorCode.PAYLOAD_TOO_LARGE
        );
      }
    }

  // Phase 2: Log consolidated request characteristics
  logger.info('[Chat API] Request characteristics', {
    requestId,
    requestFormat: body.messages ? 'NEW' : 'LEGACY',
    messageCount: messages.length,
    currentMessagePresent: typeof body.message === 'string' && body.message.length > 0,
    userTier: authContext.profile?.subscription_tier || 'anonymous',
    webSearchEnabled: !!body.webSearch,
    reasoningRequested: !!reasoning,
    reasoningEffort: reasoning ? reasoning.effort : undefined,
  imageOutputRequested: imageOutput,
  });

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

    // Enterprise gating for image generation
    if (imageOutput) {
      const tier = authContext.profile?.subscription_tier;
      if (tier !== 'enterprise') {
        throw new ApiErrorResponse('Image Generation is available for enterprise accounts only', ErrorCode.FORBIDDEN);
      }
    }
    
  // Phase 4: Calculate model-aware max tokens
  const tier = (authContext.profile?.subscription_tier || 'anonymous') as SubscriptionTier;
  const tokenStrategy = await getModelTokenLimits(enhancedData.model, { tier });
    const dynamicMaxTokens = tokenStrategy.maxOutputTokens;
    
  logger.info(`[Chat API] Model: ${enhancedData.model}`, { requestId });
  logger.debug(`[Chat API] Token strategy - Input: ${tokenStrategy.maxInputTokens}, Output: ${tokenStrategy.maxOutputTokens}`, { requestId });
  logger.debug(`[Chat API] Using dynamic max_tokens: ${dynamicMaxTokens} (calculated from model limits)`, { requestId });
    
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
  // Enforce enterprise-only configurability for webMaxResults (Pro defaults to 3)
  const reqTier = (authContext.profile?.subscription_tier || 'anonymous') as SubscriptionTier;
  const requestedMax = Number.isFinite(body?.webMaxResults) ? Math.max(1, Math.min(10, Math.trunc(body.webMaxResults))) : undefined;
  const effectiveWebMax = (() => {
    if (!body.webSearch) return undefined; // not used when web search is off
    if (reqTier === 'enterprise') return requestedMax ?? 3; // enterprise can configure
    if (reqTier === 'pro') return 3; // force default for Pro
    return undefined; // anonymous/free: webSearch would have been rejected above
  })();

  const openRouterResponse = await getOpenRouterCompletion(
      messages,
      enhancedData.model,
      dynamicMaxTokens,
      enhancedData.temperature,
      enhancedData.systemPrompt,
      authContext,
      { webSearch: !!body.webSearch, webMaxResults: effectiveWebMax, reasoning, modalities: (() => {
        if (!imageOutput) return undefined;
        try {
          // Only add image modality if model supports it
          // (best-effort; fetch list and check output_modalities)
          // Reuse previously fetched models if any earlier (attachments path) else fetch now
          return ['text','image'];
        } catch { return ['text','image']; }
      })() }
    );
    logger.debug('OpenRouter response received:', openRouterResponse);
  const assistantResponse = openRouterResponse.choices[0].message.content;
  // Phase 2: extract any data URL images (non-persisted) when image output requested
  let outputImages: string[] | undefined;
  if (imageOutput) {
    try {
      outputImages = extractOutputImageDataUrls(openRouterResponse);
    } catch {
      outputImages = undefined; // swallow extraction errors
    }
  }
  // Some providers may include reasoning/thinking text in non-standard fields; map if available
  type MaybeReasoningMessage = { choices?: { message?: { reasoning?: string } }[]; reasoning?: Record<string, unknown> };
  const maybe = openRouterResponse as unknown as MaybeReasoningMessage;
  const reasoningText = maybe?.choices?.[0]?.message?.reasoning;
  const reasoningDetails = maybe?.reasoning;
  const usage = openRouterResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
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
  logger.debug('Measured assistant generation latency (ms):', { elapsedMs, requestId });

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
          : [],
        requestId,
      });
    }

  const response: ChatResponse = {
      response: assistantResponse,
      usage: {
        prompt_tokens: usage?.prompt_tokens ?? 0,
        completion_tokens: usage?.completion_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
        prompt_tokens_details: usage?.prompt_tokens_details,
        completion_tokens_details: usage?.completion_tokens_details,
      },
      request_id: triggeringUserId || undefined, // Deterministic linkage to triggering user message
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsedMs,
      contentType: "markdown", // Always use markdown rendering for consistent experience
      id: openRouterResponse.id, // Pass OpenRouter response id to ChatResponse
  model: openRouterResponse.model || enhancedData.model,
    };
  if (typeof reasoningText === 'string' && reasoningText.length > 0) response.reasoning = reasoningText;
  if (reasoningDetails && typeof reasoningDetails === 'object') {
    const reasoningArray = Array.isArray(reasoningDetails) ? reasoningDetails : [reasoningDetails];
    if (reasoningArray.length > 0) {
      response.reasoning_details = reasoningArray;
    }
  }
  // Attach annotations if present (for future UI rendering); ignored by client if unknown
  response.annotations = annotations;
  // Echo web search activation for persistence layer
  response.has_websearch = !!body.webSearch;
  response.websearch_result_count = Array.isArray(annotations) ? annotations.length : 0;
  if (outputImages && outputImages.length > 0) {
    response.output_images = outputImages;
  }

    logger.info('Chat request successful', {
      userId: authContext.user?.id,
      model: enhancedData.model,
      tokens: usage.total_tokens,
      tier: authContext.profile?.subscription_tier,
      requestId,
      imageCount: outputImages?.length || 0,
    });
    
  return createSuccessResponse(response, 200, { 'x-request-id': requestId, 'X-Model': (response.model ?? enhancedData.model) });
  } catch (error) {
    logger.error('Error processing chat request:', { error, requestId });
    // Include requested/resolved model for Sentry tagging when available
    return handleError(error, requestId, '/api/chat', { model: modelTag });
  }
}

// Apply enhanced authentication middleware with tiered rate limiting
export const POST = withEnhancedAuth(
  withRedisRateLimitEnhanced(chatHandler, { tier: "tierA" })
);
