// src/app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { getOpenRouterCompletion } from '../../../../lib/utils/openrouter';
import { validateChatRequest } from '../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../lib/utils/response';
import { logger } from '../../../../lib/utils/logger';
import { detectMarkdownContent } from '../../../../lib/utils/markdown';
import { ChatResponse } from '../../../../lib/types';
import { OpenRouterRequest } from '../../../../lib/types/openrouter';

export async function POST(req: NextRequest) {
  logger.info('Chat request received');
  try {
    const body = await req.json();
    const { data, error } = validateChatRequest(body);

    if (error) {
      logger.warn('Invalid chat request:', error);
      throw new ApiErrorResponse(error, ErrorCode.BAD_REQUEST);
    }

    logger.debug('Validated chat request data:', data);

    // Phase 2: Support both old and new message formats
    const messages: OpenRouterRequest['messages'] = data!.messages || [{ role: 'user', content: data!.message }];
    
    // Phase 2: Log request format for human verification
    console.log(`[Chat API] Request format: ${data!.messages ? 'NEW' : 'LEGACY'}`);
    console.log(`[Chat API] Message count: ${messages.length} messages`);
    console.log(`[Chat API] Current message: "${data!.message}"`);
    
    const openRouterResponse = await getOpenRouterCompletion(messages, data!.model);
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

    const response: ChatResponse = {
      response: assistantResponse,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      timestamp: new Date().toISOString(),
      elapsed_time: elapsedTime,
      contentType: hasMarkdown ? "markdown" : "text", // Add content type detection
      id: openRouterResponse.id, // Pass OpenRouter response id to ChatResponse
    };

    logger.info('Chat request successful');
    return createSuccessResponse(response);
  } catch (error) {
    logger.error('Error processing chat request:', error);
    return handleError(error);
  }
}
