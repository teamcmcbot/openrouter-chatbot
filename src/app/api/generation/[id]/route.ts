// src/app/api/generation/[id]/route.ts
import { NextRequest } from 'next/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../../lib/utils/response';
import { logger } from '../../../../../lib/utils/logger';
import { GenerationResponse } from '../../../../../lib/types/generation';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info('Generation details request received', { id });
  
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.error('OpenRouter API key not configured');
      throw new ApiErrorResponse('OpenRouter API key not configured', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const url = `https://openrouter.ai/api/v1/generation?id=${id}`;
    logger.debug('Fetching from OpenRouter generation API', { url, id });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.error('OpenRouter generation API error', {
        status: response.status,
        statusText: response.statusText,
        id
      });
      
      if (response.status === 404) {
        throw new ApiErrorResponse('Generation not found', ErrorCode.NOT_FOUND);
      }
      
      throw new ApiErrorResponse(
        `OpenRouter API error: ${response.status} ${response.statusText}`,
        ErrorCode.BAD_GATEWAY
      );
    }

    const data: GenerationResponse = await response.json();
    logger.info('Generation details retrieved successfully', { id });
    
    return createSuccessResponse(data);
  } catch (error) {
    logger.error('Error fetching generation details:', error);
    return handleError(error);
  }
}
