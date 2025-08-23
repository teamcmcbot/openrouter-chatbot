// src/app/api/chat/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTextStreamResponse } from 'ai';
import { validateChatRequestWithAuth, validateRequestLimits } from '../../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { logger } from '../../../../../lib/utils/logger';
import { AuthContext } from '../../../../../lib/types/auth';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { estimateTokenCount, getModelTokenLimits } from '../../../../../lib/utils/tokens';
import { createClient } from '../../../../../lib/supabase/server';
import { getOpenRouterCompletionStream, fetchOpenRouterModels } from '../../../../../lib/utils/openrouter';
import { OpenRouterContentBlock } from '../../../../../lib/types/openrouter';

// Configure extended timeout for streaming requests
export const maxDuration = 300; // 5 minutes for reasoning mode and slow models

async function chatStreamHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  console.log('🔴🔴🔴 STREAM API CALLED - This should always show if streaming endpoint is hit');
  
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
    
    const textStream = new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        console.log('🟡 [STREAM DEBUG] Processing chunk:', chunk.length, 'bytes');
        const text = new TextDecoder().decode(chunk);
        console.log('🟡 [STREAM DEBUG] Decoded text:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        
        // Check for metadata chunks
        const metadataMatch = text.match(/__METADATA__([\s\S]*?)__END__/);
        if (metadataMatch) {
          console.log('🟡 [STREAM DEBUG] Found metadata chunk:', metadataMatch[1]);
          try {
            const metadataChunk = JSON.parse(metadataMatch[1]);
            if (metadataChunk.type === 'metadata' && metadataChunk.data) {
              streamMetadata = metadataChunk.data;
              console.log('🟢 [STREAM DEBUG] Extracted metadata:', streamMetadata);
            }
          } catch (error) {
            console.log('🔴 [STREAM DEBUG] Metadata parsing error:', error);
          }
          // Don't forward metadata chunks to the client
          return;
        }
        
        // CRITICAL FIX: Filter out reasoning chunks from content accumulation
        let cleanedText = text;
        
        // Remove reasoning chunk lines from content accumulation (but still forward to client for real-time display)
        const reasoningChunkRegex = /__REASONING_CHUNK__\{[^}]*\}/g;
        const reasoningDetailsRegex = /__REASONING_DETAILS_CHUNK__\{[^}]*\}/g;
        
        // Check if this chunk contains reasoning markers
        if (reasoningChunkRegex.test(text) || reasoningDetailsRegex.test(text)) {
          // Split by lines and filter out reasoning chunks for content accumulation
          const lines = text.split('\n');
          const contentLines = lines.filter(line => 
            !line.trim().startsWith('__REASONING_CHUNK__') && 
            !line.trim().startsWith('__REASONING_DETAILS_CHUNK__')
          );
          cleanedText = contentLines.join('\n');
          console.log('🟢 [STREAM DEBUG] Filtered reasoning markers from content accumulation');
        }
        
        // Forward full content to the client (including reasoning for real-time display)
        controller.enqueue(text);
        
        // Accumulate only cleaned content (without reasoning markers) for final response
        fullCompletion += cleanedText;
      },
      async flush(controller) {
        console.log('🟡 [STREAM DEBUG] Stream flush called');
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
                    console.log('🟢 [STREAM DEBUG] Normalizing OpenRouter citation:', { url, title: title?.substring(0, 50) + '...' });
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
            ...(streamMetadata.reasoning && { reasoning: streamMetadata.reasoning }),
            ...(streamMetadata.reasoning_details && Array.isArray(streamMetadata.reasoning_details) && streamMetadata.reasoning_details.length > 0 && { reasoning_details: streamMetadata.reasoning_details }),
            annotations,
            has_websearch: !!body.webSearch,
            websearch_result_count: Array.isArray(annotations) ? annotations.length : 0,
          }
        };

        console.log('🟢 [STREAM DEBUG] Final metadata created:', finalMetadata);

        // Send final metadata as a stream chunk with clear delimiter
        const metadataDelimiter = '\n\n__STREAM_METADATA_START__\n';
        const finalMetadataJson = JSON.stringify(finalMetadata);
        const metadataEnd = '\n__STREAM_METADATA_END__\n';
        
        console.log('🟢 [STREAM DEBUG] Sending metadata chunk:', finalMetadataJson.substring(0, 200) + '...');
        controller.enqueue(metadataDelimiter + finalMetadataJson + metadataEnd);
        
        // Log completion when stream finishes
        logger.info('Chat stream completed', {
          userId: authContext.user?.id,
          model: enhancedData.model,
          elapsedMs,
          tier: authContext.profile?.subscription_tier,
          completionLength: fullCompletion.length,
          contentType: 'markdown',
          usage: streamMetadata.usage,
          hasReasoning: !!streamMetadata.reasoning,
          annotationCount: annotations.length,
          triggeredBy: triggeringUserId,
          metadataInFinalChunk: true
        });
      }
    });

    // Pipe the OpenRouter stream through the transformer to get a text stream
    const textReadableStream = stream.pipeThrough(textStream);

    console.log('🟡 [STREAM DEBUG] Creating response with streaming headers');
    
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
