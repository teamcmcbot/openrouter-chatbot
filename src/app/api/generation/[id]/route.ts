// src/app/api/generation/[id]/route.ts
import { NextRequest } from 'next/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { createSuccessResponse } from '../../../../../lib/utils/response';
import { logger } from '../../../../../lib/utils/logger';
import { GenerationResponse } from '../../../../../lib/types/generation';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

async function generationHandler(
  req: NextRequest,
  authContext: AuthContext
) {
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  // Extract the ID from the URL path
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const id = pathSegments[pathSegments.length - 1];
  
  logger.debug('Generation details request received', { 
    id,
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier
  });
  
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.error('OpenRouter API key not configured');
      throw new ApiErrorResponse('OpenRouter API key not configured', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const generationUrl = `https://openrouter.ai/api/v1/generation?id=${id}`;
    logger.debug('Fetching from OpenRouter generation API', { url: generationUrl, id });

    const response = await fetch(generationUrl, {
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
    const durationMs = Date.now() - t0;
    logger.info('Generation details retrieved successfully', { 
      requestId,
      durationMs,
    });
    
    return createSuccessResponse(data, 200, { 'x-request-id': requestId });
  } catch (error) {
    logger.error('Error fetching generation details:', error);
    return handleError(error, requestId);
  }
}

export const GET = withEnhancedAuth(
  withTieredRateLimit(generationHandler, { tier: 'tierC' })
);
