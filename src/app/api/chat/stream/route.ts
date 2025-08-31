// src/app/api/chat/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTextStreamResponse } from 'ai';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { logger } from '../../../../../lib/utils/logger';
import { AuthContext } from '../../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { estimateTokenCount } from '../../../../../lib/utils/tokens';
import { getModelTokenLimits } from '../../../../../lib/utils/tokens.server';
import { MAX_MESSAGE_CHARS } from '../../../../../lib/config/limits';
type SubscriptionTier = 'anonymous' | 'free' | 'pro' | 'enterprise';
import { createClient } from '../../../../../lib/supabase/server';
import { getOpenRouterCompletionStream, fetchOpenRouterModels } from '../../../../../lib/utils/openrouter';
import { OpenRouterContentBlock } from '../../../../../lib/types/openrouter';

// Configure extended timeout for streaming requests
export const maxDuration = 300; // 5 minutes for reasoning mode and slow models

// Safe header accessor to support both real NextRequest headers and plain object mocks in tests
function safeHeaderGet(headers: unknown, key: string): string | undefined {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();
  try {
    const anyHeaders = headers as { get?: (k: string) => unknown };
    if (typeof anyHeaders.get === 'function') {
      const v = anyHeaders.get(key) ?? anyHeaders.get(lowerKey) ?? anyHeaders.get(key.toUpperCase());
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v[0];
      return v as string | undefined;
    }
  } catch {
    // ignore and try object access below
  }
  if (typeof headers === 'object') {
    const rec = headers as Record<string, unknown>;
    // direct lower-case match first
    if (typeof rec[lowerKey] === 'string') return rec[lowerKey] as string;
    // case-insensitive search across keys
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === lowerKey) {
        const v = rec[k];
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v[0] as string;
        return v as string | undefined;
      }
    }
  }
  return undefined;
}

async function chatStreamHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  // console.log('🔴🔴🔴 STREAM API CALLED - This should always show if streaming endpoint is hit');
  
    // Generate or forward a request id for correlation
    const forwardedId = safeHeaderGet((request as unknown as { headers?: unknown })?.headers, 'x-request-id')
      || safeHeaderGet((request as unknown as { headers?: unknown })?.headers, 'x-correlation-id');
    const requestId = forwardedId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.info('Chat stream request received', {
      isAuthenticated: authContext.isAuthenticated,
      userId: authContext.user?.id,
      tier: authContext.profile?.subscription_tier,
      requestId,
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
      streaming: true,
      requestId,
    });

    // All the same validation logic as non-streaming endpoint
    const supabase = await createClient();

    const attachmentIds: string[] = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    const reasoning: { effort?: 'low' | 'medium' | 'high' } | undefined = body?.reasoning && typeof body.reasoning === 'object'
      ? { effort: ['low','medium','high'].includes(body.reasoning.effort) ? body.reasoning.effort : 'low' }
      : undefined;

    // Handle attachments validation and processing (same logic as non-streaming)
    const messages: { role: 'user' | 'assistant'; content: string | OpenRouterContentBlock[] }[] = enhancedData.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

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
      
      logger.info('Chat stream send with attachments', {
        userId: authContext.user.id,
        model: enhancedData.model,
        attachments_count: attachmentIds.length,
        draft_id: body.draftId,
        requestId,
      });
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
  const tier = (authContext.profile?.subscription_tier || 'anonymous') as SubscriptionTier;
  const tokenStrategy = await getModelTokenLimits(enhancedData.model, { tier });
    const dynamicMaxTokens = tokenStrategy.maxOutputTokens;
    
    // console.log(`[Chat Stream API] Model: ${enhancedData.model}`);
    // console.log(`[Chat Stream API] Token strategy - Input: ${tokenStrategy.maxInputTokens}, Output: ${tokenStrategy.maxOutputTokens}`);
    // console.log(`[Chat Stream API] Using dynamic max_tokens: ${dynamicMaxTokens} (calculated from model limits)`);
    
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
    // console.log(`[Chat Stream API] Request format: ${body.messages ? 'NEW' : 'LEGACY'}`);
    // console.log(`[Chat Stream API] Message count: ${enhancedData.messages.length} messages`);
    // console.log(`[Chat Stream API] User tier: ${authContext.profile?.subscription_tier || 'anonymous'}`);
    // console.log(`[Chat Stream API] Web search enabled: ${!!body.webSearch}`);
    // console.log(`[Chat Stream API] Reasoning requested: ${!!reasoning} ${reasoning ? `(effort=${reasoning.effort})` : ''}`);

    const startTime = Date.now();

    // Get streaming response from OpenRouter
    // Enforce enterprise-only configurability for webMaxResults (Pro defaults to 3)
    const reqTier = (authContext.profile?.subscription_tier || 'anonymous') as SubscriptionTier;
    const requestedMax = Number.isFinite(body?.webMaxResults) ? Math.max(1, Math.min(10, Math.trunc(body.webMaxResults))) : undefined;
    const effectiveWebMax = (() => {
      if (!body.webSearch) return undefined;
      if (reqTier === 'enterprise') return requestedMax ?? 3;
      if (reqTier === 'pro') return 3;
      return undefined;
    })();

    const stream = await getOpenRouterCompletionStream(
      messages,
      enhancedData.model,
      dynamicMaxTokens,
      enhancedData.temperature,
      enhancedData.systemPrompt,
      authContext,
      { webSearch: !!body.webSearch, webMaxResults: effectiveWebMax, reasoning }
    );

    // Transform the OpenRouter stream to extract metadata and content
    let fullCompletion = '';
    let streamMetadata: {
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      id?: string;
      model?: string;
      reasoning?: string;
      reasoning_details?: Record<string, unknown>[];
      annotations?: {
        type: 'url_citation';
        url: string;
        title?: string;
        content?: string;
        start_index?: number;
        end_index?: number;
      }[];
    } = {};
    
    // Determine triggering user message ID (same logic as non-streaming)
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
    
    // Rolling line buffer and balanced marker parsing
    let carry = '';
    const streamDebug = process.env.STREAM_DEBUG === '1';
    const STREAM_MARKERS_ENABLED = (process.env.STREAM_MARKERS_ENABLED || '1') === '1';
    const STREAM_REASONING_ENABLED = (process.env.STREAM_REASONING_ENABLED || '1') === '1';
    let firstAnnotationMs: number | undefined;
    const textStream = new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Extract and consume backend metadata sentinels first (not forwarded)
        const metaRegex = /__METADATA__([\s\S]*?)__END__/g;
        let metaMatch;
        while ((metaMatch = metaRegex.exec(text)) !== null) {
          try {
            const metadataChunk = JSON.parse(metaMatch[1]);
            if (metadataChunk?.type === 'metadata' && metadataChunk.data) {
              streamMetadata = metadataChunk.data;
            }
          } catch (e) {
            if (streamDebug) logger.warn('STREAM_DEBUG metadata parse error', { error: e, requestId });
          }
        }

        // Remove backend metadata from the visible stream content
        const stripped = text.replace(metaRegex, '');
        carry += stripped;

        // Process complete lines only
        const lines = carry.split('\n');
        carry = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Forward pure annotation marker lines (if enabled)
          if (STREAM_MARKERS_ENABLED && trimmed.startsWith('__ANNOTATIONS_CHUNK__')) {
            const idx = trimmed.indexOf('{');
            if (idx !== -1) {
              const jsonStr = trimmed.slice(idx);
              // Basic balanced braces check
              let depth = 0;
              for (const ch of jsonStr) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
              }
              if (depth === 0) {
                if (firstAnnotationMs === undefined) {
                  firstAnnotationMs = Date.now() - startTime;
                  logger.info('TTF_annotation', { ms: firstAnnotationMs, model: enhancedData.model, requestId });
                }
                controller.enqueue(trimmed + '\n');
                continue;
              }
            }
          }

          // Forward pure reasoning marker lines only if allowed by server-side validation and enabled
          const allowReasoning = !!reasoning && STREAM_REASONING_ENABLED; // tier + flag
          if (STREAM_MARKERS_ENABLED && trimmed.startsWith('__REASONING_CHUNK__')) {
            const idx = trimmed.indexOf('{');
            if (idx !== -1) {
              const jsonStr = trimmed.slice(idx);
              let depth = 0;
              for (const ch of jsonStr) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
              }
              if (depth === 0) {
                if (allowReasoning) controller.enqueue(trimmed + '\n');
                continue;
              }
            }
          }

          // Otherwise treat as normal content
          // IMPORTANT: preserve newline characters in the accumulated completion so
          // the final metadata.response renders markdown correctly after streaming.
          fullCompletion += line + '\n';
          controller.enqueue(line + '\n');
        }
      },
      async flush(controller) {
        // console.log('🟡 [STREAM DEBUG] Stream flush called');
        // Calculate elapsed time - always use markdown rendering
        const endTime = Date.now();
        const elapsedMs = endTime - startTime;
        
        // Normalize annotations to flat structure (same as non-streaming)
        const rawAnnotations = streamMetadata.annotations ?? [];
        const annotations = Array.isArray(rawAnnotations)
          ? (rawAnnotations
              .map((ann: unknown) => {
                if (!ann || typeof ann !== 'object') return null;
                const a = ann as Record<string, unknown>;
                
                // Handle OpenRouter's nested url_citation structure
                if (a.type === 'url_citation' && a.url_citation && typeof a.url_citation === 'object') {
                  const nested = a.url_citation as Record<string, unknown>;
                  if (typeof nested.url === 'string') {
                    const { url, title, content, start_index, end_index } = nested as {
                      url: string; title?: string; content?: string; start_index?: number; end_index?: number;
                    };
                    // console.log('🟢 [STREAM DEBUG] Normalizing OpenRouter citation:', { url, title: title?.substring(0, 50) + '...' });
                    return { type: 'url_citation', url, title, content, start_index, end_index };
                  }
                }
                
                // Already flat format
                if (a.type === 'url_citation' && typeof a.url === 'string') {
                  return a as unknown as { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number };
                }
                
                // Fallback: objects with URL but missing type
                if (typeof a.url === 'string' && !a.type) {
                  const { url, title, content, start_index, end_index } = a as {
                    url: string; title?: string; content?: string; start_index?: number; end_index?: number;
                  };
                  return { type: 'url_citation', url, title, content, start_index, end_index };
                }
                return null;
              })
              .filter((x): x is { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number } => !!x))
          : [];

  // Create final metadata response (same structure as non-streaming ChatResponse)
        const finalMetadata = {
          __FINAL_METADATA__: {
            response: fullCompletion,
            usage: streamMetadata.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            request_id: triggeringUserId || undefined,
            timestamp: new Date().toISOString(),
            elapsed_ms: elapsedMs,
            contentType: "markdown", // Always use markdown rendering
            id: streamMetadata.id || `stream_${Date.now()}`,
            model: streamMetadata.model || enhancedData.model,
            ...(streamMetadata.reasoning && { reasoning: streamMetadata.reasoning }),
            ...(streamMetadata.reasoning_details && Array.isArray(streamMetadata.reasoning_details) && streamMetadata.reasoning_details.length > 0 && { reasoning_details: streamMetadata.reasoning_details }),
            annotations,
            has_websearch: !!body.webSearch,
            websearch_result_count: Array.isArray(annotations) ? annotations.length : 0,
          }
        };

        // console.log('🟢 [STREAM DEBUG] Final metadata created:', finalMetadata);

  // Emit standardized one-line final metadata JSON
  const finalLine = JSON.stringify(finalMetadata);
  controller.enqueue(`\n${finalLine}\n`);
        
        // Log completion when stream finishes
        logger.info('Chat stream completed', {
          userId: authContext.user?.id,
          model: enhancedData.model,
          elapsedMs,
          ttfAnnotationMs: firstAnnotationMs,
          tier: authContext.profile?.subscription_tier,
          completionLength: fullCompletion.length,
          contentType: 'markdown',
          usage: streamMetadata.usage,
          hasReasoning: !!streamMetadata.reasoning,
          annotationCount: annotations.length,
          triggeredBy: triggeringUserId,
            metadataInFinalChunk: true,
            requestId,
        });
      }
    });

    // Pipe the OpenRouter stream through the transformer to get a text stream
    const textReadableStream = stream.pipeThrough(textStream);

  // Normalize to a plain ReadableStream<string> for test compatibility
  const normalizedTextStream = new ReadableStream<string>({
      start(controller) {
        const reader = textReadableStream.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
        if (value !== undefined) controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
            controller.close();
          }
        })();
      }
    });

    // Return the streaming text response using AI SDK v5
    const streamResponse = createTextStreamResponse({
      textStream: normalizedTextStream,
      headers: {
        'X-Streaming': 'true',
        'X-Model': enhancedData.model,
      'X-Request-ID': requestId,
      }
    });

    // Ensure we hand back a Web ReadableStream (with getReader) for tests and runtime
    const candidateBody = (streamResponse as unknown as { body?: unknown }).body as unknown;
    const hasGetReader = (v: unknown): v is { getReader: () => unknown } =>
      !!v && typeof v === 'object' && 'getReader' in (v as Record<string, unknown>) && typeof (v as { getReader?: unknown }).getReader === 'function';
    const responseBody: ReadableStream<unknown> = hasGetReader(candidateBody)
      ? (candidateBody as ReadableStream<unknown>)
      : (normalizedTextStream as unknown as ReadableStream<unknown>);

    // Convert to NextResponse to match middleware expectations
    return new NextResponse(responseBody, {
      status: streamResponse.status,
      statusText: streamResponse.statusText,
      headers: streamResponse.headers,
    });

  } catch (error) {
    logger.error('Error processing chat stream request:', { error, requestId });
    return handleError(error, requestId);
  }
}

// Apply enhanced authentication middleware with TierA rate limiting (same as /api/chat)
export const POST = withEnhancedAuth(
  withTieredRateLimit(chatStreamHandler, { tier: "tierA" })
);
