// src/app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { getOpenRouterCompletion } from '../../../../lib/utils/openrouter';
import { validateChatRequest } from '../../../../lib/utils/validation';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../lib/utils/response';
import { logger } from '../../../../lib/utils/logger';
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

    const messages: OpenRouterRequest['messages'] = [{ role: 'user', content: data!.message }];
    const openRouterResponse = await getOpenRouterCompletion(messages);

    const assistantResponse = openRouterResponse.choices[0].message.content;

    const response: ChatResponse = {
      response: assistantResponse,
      timestamp: new Date().toISOString(),
    };

    logger.info('Chat request successful');
    return createSuccessResponse(response);
  } catch (error) {
    logger.error('Error processing chat request:', error);
    return handleError(error);
  }
}
