import { NextRequest, NextResponse } from "next/server";
import { getEnvVar, isEnhancedModelsEnabled } from "../../../../lib/utils/env";
import { logger } from "../../../../lib/utils/logger";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check if enhanced mode is requested via query parameter or feature flag
    const { searchParams } = new URL(request.url);
    const enhancedParam = searchParams.get("enhanced");
    const isEnhancedRequested = enhancedParam === "true" || isEnhancedModelsEnabled();
    
    logger.info(`Models API called - Enhanced mode: ${isEnhancedRequested}`);
    
    // Get the models list from environment variable
    const modelsListEnv = getEnvVar("OPENROUTER_MODELS_LIST", "gpt-3.5-turbo,gpt-4,claude-3-sonnet");
    
    // Parse the comma-separated list
    const models = modelsListEnv
      .split(",")
      .map((model: string) => model.trim())
      .filter((model: string) => model.length > 0);

    // For now, return the basic format regardless of enhanced flag
    // Enhanced functionality will be implemented in Phase 1
    const response = { models };
    
    // Log metrics for monitoring adoption
    const responseTime = Date.now() - startTime;
    logger.info(`Models API response - Enhanced: ${isEnhancedRequested}, Models: ${models.length}, Time: ${responseTime}ms`);
    
    // Add headers for monitoring
    const headers = new Headers();
    headers.set('X-Enhanced-Mode', isEnhancedRequested.toString());
    headers.set('X-Response-Time', responseTime.toString());
    headers.set('X-Models-Count', models.length.toString());
    
    return NextResponse.json(response, { headers });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error("Error fetching models:", error);
    
    // Return fallback models if environment variable is not set
    const fallbackModels = ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"];
    const response = { models: fallbackModels };
    
    logger.info(`Models API fallback response - Time: ${responseTime}ms`);
    
    const headers = new Headers();
    headers.set('X-Fallback-Used', 'true');
    headers.set('X-Response-Time', responseTime.toString());
    
    return NextResponse.json(response, { headers });
  }
}
