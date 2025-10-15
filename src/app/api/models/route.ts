import { NextRequest, NextResponse } from "next/server";
import { logger } from "../../../../lib/utils/logger";
import { handleError } from "../../../../lib/utils/errors";
import { 
  transformDatabaseModel
} from "../../../../lib/utils/openrouter";
import { createClient } from "../../../../lib/supabase/server";
import { ModelInfo, ModelsResponse } from "../../../../lib/types/openrouter";
import { AuthContext } from "../../../../lib/types/auth";
import { withEnhancedAuth } from "../../../../lib/middleware/auth";
import { withRedisRateLimitEnhanced } from "../../../../lib/middleware/redisRateLimitMiddleware";
import { deriveRequestIdFromHeaders } from "../../../../lib/utils/headers";

async function modelsHandler(request: NextRequest, authContext: AuthContext) {
  const route = "/api/models";
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const startTime = Date.now();
  // Log authentication context for monitoring (similar to chat endpoint)
  logger.info('Models request received', {
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier,
    requestId,
    route,
  });
  try {
  // Enhanced-only endpoint: ignore any legacy query params
  logger.info(`Models API called - Enhanced mode only`, { requestId, route });

    // Get allowed models from database (model_access) using latest schema
    const supabase = await createClient();
    
    // Determine user tier for query optimization
    const tier = authContext.profile?.subscription_tier || 'free';
    logger.info(`User subscription tier: ${tier}`, { requestId, route });
    
    // Build dynamic query based on subscription tier
    let query = supabase
      .from('model_access')
      .select(`
        model_id,
        canonical_slug,
        hugging_face_id,
        model_name,
        model_description,
        context_length,
        created_timestamp,
        modality,
        input_modalities,
        output_modalities,
        tokenizer,
        prompt_price,
        completion_price,
        request_price,
        image_price,
        output_image_price,
        web_search_price,
        internal_reasoning_price,
        input_cache_read_price,
        input_cache_write_price,
        max_completion_tokens,
        is_moderated,
        supported_parameters,
        status,
        is_free,
        is_pro,
        is_enterprise,
        daily_limit,
        monthly_limit,
        last_synced_at,
        openrouter_last_seen,
        created_at,
        updated_at
      `)
      .eq('status', 'active');
    
    // Apply tier-specific filtering at database level
    if (tier === 'free' || !tier) {
      // Free tier: only models marked as free
      query = query.eq('is_free', true);
    } else if (tier === 'pro') {
      // Pro tier: free models OR pro models
      query = query.or('is_free.eq.true,is_pro.eq.true');
    } else if (tier === 'enterprise') {
      // Enterprise tier: free models OR pro models OR enterprise models
      query = query.or('is_free.eq.true,is_pro.eq.true,is_enterprise.eq.true');
    } else {
      // fallback: treat unknown tiers as free
      query = query.eq('is_free', true);
    }

    
    const { data, error } = await query;
    
    if (error) {
      logger.error('Error fetching models from database', { error, requestId, route });
      throw error;
    }
    
    type ModelRow = {
      model_id: string;
      canonical_slug?: string;
      hugging_face_id?: string;
      model_name?: string;
      model_description?: string;
      context_length?: number;
      created_timestamp?: number;
      modality?: string;
      input_modalities?: string[];
      output_modalities?: string[];
      tokenizer?: string;
      prompt_price?: string;
      completion_price?: string;
      request_price?: string;
      image_price?: string;
      output_image_price?: string;
      web_search_price?: string;
      internal_reasoning_price?: string;
      input_cache_read_price?: string;
      input_cache_write_price?: string;
      max_completion_tokens?: number;
      is_moderated?: boolean;
      supported_parameters?: string[];
      status: string;
      is_free: boolean;
      is_pro: boolean;
      is_enterprise: boolean;
      daily_limit?: number;
      monthly_limit?: number;
      last_synced_at?: string;
      openrouter_last_seen?: string;
      created_at?: string;
      updated_at?: string;
    };
    
    const allowedModels = (data as ModelRow[]) || [];
    logger.info(`Allowed models for tier ${tier}: ${allowedModels.length}`, { requestId, route });

    // Transform database rows to ModelInfo format for frontend
    // eslint-disable-next-line prefer-const
    let transformedModels: ModelInfo[] = allowedModels.map(transformDatabaseModel);

    // Default model prioritization (non-breaking)
    if (authContext.isAuthenticated && authContext.profile?.default_model) {
      try {
        const defaultModelId = authContext.profile.default_model.trim();
        const userId = authContext.user?.id;
        const totalModels = transformedModels.length;

        logger.info('Processing default model prioritization', {
          userId,
          defaultModelId,
          totalAvailableModels: totalModels,
          userTier: authContext.profile?.subscription_tier,
          timestamp: new Date().toISOString(),
          requestId,
          route,
        });

        if (defaultModelId && typeof defaultModelId === 'string' && defaultModelId.length > 0) {
          const defaultModelIndex = transformedModels.findIndex(model => model && model.id === defaultModelId);
          if (defaultModelIndex > 0) {
            const [defaultModel] = transformedModels.splice(defaultModelIndex, 1);
            if (defaultModel) {
              transformedModels.unshift(defaultModel);
              logger.info('Default model prioritized successfully', {
                userId,
                defaultModelId,
                previousPosition: defaultModelIndex,
                newPosition: 0,
                totalModels,
                action: 'reordered',
                performance: 'optimal',
                requestId,
                route,
              });
            }
          } else if (defaultModelIndex === 0) {
            logger.info('Default model already prioritized', {
              userId,
              defaultModelId,
              position: 'first',
              action: 'no_change_required',
              totalModels,
              requestId,
              route,
            });
          } else {
            logger.warn('Default model not accessible to user', {
              userId,
              defaultModelId,
              userTier: authContext.profile?.subscription_tier,
              totalAvailableModels: totalModels,
              action: 'model_not_found',
              suggestion: 'user_should_update_default',
              requestId,
              route,
            });
          }
        }
      } catch (error) {
        logger.error('Default model prioritization failed', {
          userId: authContext.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId,
          route,
        });
      }
    }

    const enhancedResponse: ModelsResponse = {
      models: transformedModels
    };

    // Log metrics for monitoring
    const responseTime = Date.now() - startTime;
    logger.info(`Models API response - Models: ${transformedModels.length}, Tier: ${tier}, Time: ${responseTime}ms, Source: database`, { requestId, route });

    // Add headers for monitoring
    const headers = new Headers();
    headers.set('X-Response-Time', responseTime.toString());
    headers.set('X-Models-Count', transformedModels.length.toString());
    headers.set('X-User-Tier', tier);
    headers.set('X-Models-Source', 'database');
    headers.set('x-request-id', requestId);

    return NextResponse.json(enhancedResponse, { headers });

  } catch (error) {
    logger.error("Critical error in models API:", { error, requestId, route });
  return handleError(error, requestId, route);
  }
}

// Export GET handler with enhanced authentication (injects AuthContext)
export const GET = withEnhancedAuth(
  withRedisRateLimitEnhanced(modelsHandler, { tier: "tierC" })
);
