import { NextRequest, NextResponse } from "next/server";
import { getEnvVar, isEnhancedModelsEnabled } from "../../../../lib/utils/env";
import { logger } from "../../../../lib/utils/logger";
import { handleError } from "../../../../lib/utils/errors";
import { 
  fetchOpenRouterModels, 
  transformOpenRouterModel, 
  filterAllowedModels 
} from "../../../../lib/utils/openrouter";
import { ModelInfo, ModelsResponse, LegacyModelsResponse } from "../../../../lib/types/openrouter";
import { unstable_cache } from "next/cache";

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

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check if enhanced mode is requested via query parameter or feature flag
    const { searchParams } = new URL(request.url);
    const enhancedParam = searchParams.get("enhanced");
    const isEnhancedRequested = enhancedParam === "true" || isEnhancedModelsEnabled();
    
    logger.info(`Models API called - Enhanced mode: ${isEnhancedRequested}`);
    
    // Get the allowed models list from environment variable
    const modelsListEnv = getEnvVar("OPENROUTER_MODELS_LIST", "");
    const allowedModelIds = modelsListEnv
      .split(",")
      .map((model: string) => model.trim())
      .filter((model: string) => model.length > 0);
    
    if (isEnhancedRequested) {
      try {
        // Fetch models from OpenRouter API with caching
        const allModels = await getCachedModels();
        
        // Filter to only allowed models
        const filteredModels = filterAllowedModels(allModels, allowedModelIds);
        
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
