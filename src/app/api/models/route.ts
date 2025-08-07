import { NextRequest, NextResponse } from "next/server";
import { isEnhancedModelsEnabled } from "../../../../lib/utils/env";
import { logger } from "../../../../lib/utils/logger";
import { handleError } from "../../../../lib/utils/errors";
import { 
  fetchOpenRouterModels, 
  transformOpenRouterModel, 
  filterAllowedModels 
} from "../../../../lib/utils/openrouter";
import { createClient } from "../../../../lib/supabase/server";
import { ModelInfo, ModelsResponse, LegacyModelsResponse } from "../../../../lib/types/openrouter";
import { unstable_cache } from "next/cache";
import { AuthContext } from "../../../../lib/types/auth";
import { withEnhancedAuth } from "../../../../lib/middleware/auth";

// Cache the OpenRouter models data for 10 minutes to reduce API calls
const getCachedModels = unstable_cache(
  async () => {
    const models = await fetchOpenRouterModels();
    return models;
  },
  ['openrouter-models'],
  {
    revalidate: 600, // 10 minutes
    tags: ['models']
  }
);

async function modelsHandler(request: NextRequest, authContext: AuthContext) {
  const startTime = Date.now();
  // Log authentication context for monitoring (similar to chat endpoint)
  logger.info('Models request received', {
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.user?.id,
    tier: authContext.profile?.subscription_tier
  });
  try {
    // Check if enhanced mode is requested via query parameter or feature flag
    const { searchParams } = new URL(request.url);
    const enhancedParam = searchParams.get("enhanced");
    const isEnhancedRequested = enhancedParam === "true" || isEnhancedModelsEnabled();

    logger.info(`Models API called - Enhanced mode: ${isEnhancedRequested}`);

    // Get allowed models from database (model_access) using latest schema
    const supabase = await createClient();
    // Always get all active models
    const { data, error } = await supabase
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
    if (error) {
      logger.error('Error fetching models from database', error);
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
    const allActiveModels = (data as ModelRow[]) || [];
    // Now filter by actual user subscription tier
    let allowedModelIds: string[] = [];
    const tier = authContext.profile?.subscription_tier || 'free';
    logger.info(`User subscription tier: ${tier}`);
    if (tier === 'free') {
      allowedModelIds = allActiveModels.filter(row => row.is_free).map(row => row.model_id);
    } else if (tier === 'pro') {
      allowedModelIds = allActiveModels.filter(row => row.is_pro).map(row => row.model_id);
    } else if (tier === 'enterprise') {
      allowedModelIds = allActiveModels.filter(row => row.is_enterprise).map(row => row.model_id);
    } else {
      // fallback: treat as free
      allowedModelIds = allActiveModels.filter(row => row.is_free).map(row => row.model_id);
    }
    logger.info(`Allowed models for tier ${tier}: ${allowedModelIds.length}`);

    if (isEnhancedRequested) {
      try {
        // Fetch models from OpenRouter API with caching
        const allModels = await getCachedModels();

        // Filter to only allowed models
        const filteredModels = filterAllowedModels(allModels, allowedModelIds);

        // ========================================
        // DEFAULT MODEL PRIORITIZATION FEATURE
        // ========================================
        // This feature prioritizes the user's preferred default model by moving it 
        // to the first position in the filtered models array when:
        // 1. User is authenticated (has valid session)
        // 2. User has a default_model set in their profile
        // 3. The default model exists in the user's allowed models list
        //
        // Purpose: Improves UX by showing user's preferred model first in dropdowns
        // Fallback: If default model isn't available, natural ordering is preserved
        // Performance: O(n) array search + O(n) array reordering, minimal impact
        // ========================================
        
        if (authContext.isAuthenticated && authContext.profile?.default_model) {
          try {
            const defaultModelId = authContext.profile.default_model.trim();
            const userId = authContext.user?.id;
            const totalModels = filteredModels.length;
            
            // Enhanced logging for monitoring default model usage patterns
            logger.info('Processing default model prioritization', {
              userId,
              defaultModelId,
              totalAvailableModels: totalModels,
              userTier: authContext.profile?.subscription_tier,
              timestamp: new Date().toISOString()
            });
            
            if (defaultModelId && typeof defaultModelId === 'string' && defaultModelId.length > 0) {
              // Search for the user's default model in available models
              // Uses findIndex for efficient single-pass array search
              const defaultModelIndex = filteredModels.findIndex(model => model && model.id === defaultModelId);
              
              if (defaultModelIndex > 0) { 
                // Model found but not in first position - reorder array
                // Remove from current position and add to beginning
                const [defaultModel] = filteredModels.splice(defaultModelIndex, 1);
                if (defaultModel) {
                  filteredModels.unshift(defaultModel);
                  
                  // Log successful reordering with metrics for analytics
                  logger.info('Default model prioritized successfully', {
                    userId,
                    defaultModelId,
                    previousPosition: defaultModelIndex,
                    newPosition: 0,
                    totalModels,
                    action: 'reordered',
                    performance: 'optimal'
                  });
                }
              } else if (defaultModelIndex === 0) {
                // Model already at first position - no action needed
                logger.info('Default model already prioritized', {
                  userId,
                  defaultModelId,
                  position: 'first',
                  action: 'no_change_required',
                  totalModels
                });
              } else {
                // Model not found in available models - user may have downgraded tier
                // or model may have been deprecated
                logger.warn('Default model not accessible to user', {
                  userId,
                  defaultModelId,
                  userTier: authContext.profile?.subscription_tier,
                  totalAvailableModels: totalModels,
                  action: 'model_not_found',
                  suggestion: 'user_should_update_default'
                });
              }
            } else {
              // Invalid or empty default model value detected
              logger.debug('Invalid default model configuration detected', {
                userId,
                defaultModelValue: JSON.stringify(authContext.profile.default_model),
                valueType: typeof authContext.profile.default_model,
                action: 'skipped_invalid_value'
              });
            }
          } catch (error) {
            // Comprehensive error handling to prevent API disruption
            logger.error('Default model prioritization failed', {
              userId: authContext.user?.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              action: 'graceful_fallback',
              impact: 'feature_disabled_for_request'
            });
            // Continue with normal flow - don't disrupt API response
          }
        } else {
          // Log cases where default model prioritization doesn't apply
          if (!authContext.isAuthenticated) {
            logger.debug('Default model prioritization skipped - user not authenticated');
          } else if (!authContext.profile?.default_model) {
            logger.debug('Default model prioritization skipped - no default model set', {
              userId: authContext.user?.id,
              hasProfile: !!authContext.profile
            });
          }
        }

        // Transform to ModelInfo format for frontend
        const transformedModels: ModelInfo[] = filteredModels.map(transformOpenRouterModel);

        const enhancedResponse: ModelsResponse = {
          models: transformedModels
        };

        // Log metrics for monitoring
        const responseTime = Date.now() - startTime;
        logger.info(`Enhanced Models API response - Models: ${transformedModels.length}/${allModels.length}, Time: ${responseTime}ms`);

        // Add headers for monitoring
        const headers = new Headers();
        headers.set('X-Enhanced-Mode', 'true');
        headers.set('X-Response-Time', responseTime.toString());
        headers.set('X-Models-Count', transformedModels.length.toString());
        headers.set('X-Total-Models-Available', allModels.length.toString());
        headers.set('X-Cache-Status', 'hit');

        return NextResponse.json(enhancedResponse, { headers });

      } catch (error) {
        logger.error("Error fetching enhanced models, falling back to legacy mode:", error);

        // Fall back to legacy mode if enhanced mode fails
        const fallbackResponse: LegacyModelsResponse = {
          models: allowedModelIds.length > 0 ? allowedModelIds : ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"]
        };

        const responseTime = Date.now() - startTime;
        logger.info(`Enhanced Models API fallback response - Time: ${responseTime}ms`);

        const headers = new Headers();
        headers.set('X-Enhanced-Mode', 'false');
        headers.set('X-Fallback-Used', 'true');
        headers.set('X-Response-Time', responseTime.toString());
        headers.set('X-Models-Count', fallbackResponse.models.length.toString());

        return NextResponse.json(fallbackResponse, { headers });
      }
    } else {
      // Legacy mode - return simple string array
      const legacyModels = allowedModelIds.length > 0 
        ? allowedModelIds 
        : ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"];

      const legacyResponse: LegacyModelsResponse = { models: legacyModels };

      // Log metrics for monitoring
      const responseTime = Date.now() - startTime;
      logger.info(`Legacy Models API response - Models: ${legacyModels.length}, Time: ${responseTime}ms`);

      // Add headers for monitoring
      const headers = new Headers();
      headers.set('X-Enhanced-Mode', 'false');
      headers.set('X-Response-Time', responseTime.toString());
      headers.set('X-Models-Count', legacyModels.length.toString());

      return NextResponse.json(legacyResponse, { headers });
    }

  } catch (error) {
    logger.error("Critical error in models API:", error);
    return handleError(error);
  }
}

// Export GET handler with enhanced authentication (injects AuthContext)
export const GET = withEnhancedAuth(modelsHandler);
