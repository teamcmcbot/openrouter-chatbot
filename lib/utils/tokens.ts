/**
 * Token estimation and management utilities for context-aware chat
 * 
 * This module provides functions to estimate token counts and calculate
 * model-aware token allocation strategies for OpenRouter API calls.
 */

import { ChatMessage } from '../types/chat';
import { logger } from './logger';
import { getModelConfigFromStore, hasModelConfigsInStore } from '../../stores/useModelStore';
// Import a client-only helper lazily to hydrate models from /api/models when on the browser
// Note: This function lives in a client module; only call it when typeof window !== 'undefined'.
import { fetchModelsForStore } from '../../stores/useModelStore';

// Fallback model context configurations
// Used when dynamic fetching fails or for server-side initialization
// Legacy fallbacks removed; DB and /api/models are the sources of truth

// Deprecated server-side cache (legacy). Kept as no-op placeholders to avoid breaking server-init.
let configsLastFetched = 0;

/**
 * Token allocation strategy for a model
 */
export interface TokenStrategy {
  /** Maximum tokens available for input context */
  maxInputTokens: number;
  /** Maximum tokens available for output generation */
  maxOutputTokens: number;
  /** Percentage of context used for input (0.0 to 1.0) */
  contextRatio: number;
  /** Percentage of context used for output (0.0 to 1.0) */
  outputRatio: number;
  /** Reserved tokens for safety buffer */
  reserveTokens: number;
  /** Total context length of the model */
  totalContextLength: number;
}

/**
 * Estimates the number of tokens in a text string
 * Uses a simple approximation of ~4 characters per token for English text
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  if (!text || text.length === 0) return 0;
  
  // Rough estimation: ~4 characters per token for English
  // This is a conservative estimate that works reasonably well
  const estimatedTokens = Math.ceil(text.length / 4);
  
  console.log(`[Token Estimation] Text length: ${text.length} chars → ~${estimatedTokens} tokens`);
  
  return estimatedTokens;
}

/**
 * Estimates the total number of tokens for an array of chat messages
 * Includes both content tokens and structural overhead
 * 
 * @param messages - Array of chat messages to estimate
 * @returns Estimated total token count
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  if (!messages || messages.length === 0) return 0;
  
  // Calculate content tokens
  const contentTokens = messages.reduce(
    (total, msg) => total + estimateTokenCount(msg.content),
    0
  );
  
  // Add overhead for message structure (~4 tokens per message for role, formatting, etc.)
  const structureTokens = messages.length * 4;
  
  const totalTokens = contentTokens + structureTokens;
  
  console.log(`[Token Estimation] ${messages.length} messages: ${contentTokens} content + ${structureTokens} structure = ${totalTokens} total tokens`);
  
  return totalTokens;
}

/**
 * Calculates a token allocation strategy based on model context length
 * 
 * @param contextLength - The model's maximum context length in tokens
 * @returns Token strategy with input/output allocation
 */
export function calculateTokenStrategy(contextLength: number): TokenStrategy {
  // Use environment variables if available, otherwise use defaults
  const contextRatio = parseFloat(process.env.CONTEXT_RATIO || '0.6');
  const outputRatio = parseFloat(process.env.OUTPUT_RATIO || '0.4');
  const reserveTokens = parseInt(process.env.RESERVE_TOKENS || '150');
  
  // Calculate available tokens after reserve
  const availableTokens = Math.max(0, contextLength - reserveTokens);
  
  // Allocate tokens based on ratios
  const maxInputTokens = Math.floor(availableTokens * contextRatio);
  const maxOutputTokens = Math.floor(availableTokens * outputRatio);
  
  const strategy: TokenStrategy = {
    maxInputTokens,
    maxOutputTokens,
    contextRatio,
    outputRatio,
    reserveTokens,
    totalContextLength: contextLength,
  };
  
  console.log(`[Token Strategy] Model context: ${contextLength} → Input: ${maxInputTokens} (${Math.round(contextRatio * 100)}%) | Output: ${maxOutputTokens} (${Math.round(outputRatio * 100)}%) | Reserve: ${reserveTokens}`);
  
  return strategy;
}

/**
 * Gets token limits for a specific model using cached configuration first (client-side only)
 * Falls back to API fetch then conservative defaults if model info is not available
 * 
 * @param modelId - The OpenRouter model ID
 * @returns Token strategy for the specified model
 */
export async function getModelTokenLimits(modelId?: string): Promise<TokenStrategy> {
  console.log(`[Model Token Limits] Looking up limits for model: ${modelId || 'default'}`);
  
  if (!modelId) {
    console.log(`[Model Token Limits] No model specified, using conservative default (8K context)`);
    return calculateTokenStrategy(8000); // Conservative default
  }
  
  try {
    // First, try to get model config from the store (cached from dropdown fetch)
    // Only available on client-side due to Zustand store limitations
    if (typeof window !== 'undefined') {
      try {
        if (hasModelConfigsInStore()) {
          const cachedModelConfig = getModelConfigFromStore(modelId);
          if (cachedModelConfig) {
            console.log(`[Model Token Limits] Found ${cachedModelConfig.description} with ${cachedModelConfig.context_length} context length from cache`);
            console.log(`[Model Token Limits] Using cached model ${modelId} with context length: ${cachedModelConfig.context_length}`);
            return calculateTokenStrategy(cachedModelConfig.context_length);
          } else {
            console.log(`[Model Token Limits] Model '${modelId}' not found in cached configs, falling back to API`);
          }
        } else {
          console.log(`[Model Token Limits] No cached model configs available, hydrating from /api/models`);
        }
      } catch (error) {
        console.log(`[Model Token Limits] Error accessing store cache (expected on server-side), will use conservative defaults if needed:`, error);
      }
      // Hydrate from our own API and re-check the store
      try {
        await fetchModelsForStore();
        const hydratedConfig = getModelConfigFromStore(modelId);
        if (hydratedConfig) {
          console.log(`[Model Token Limits] Hydrated from /api/models. Using ${hydratedConfig.description} with context ${hydratedConfig.context_length}`);
          return calculateTokenStrategy(hydratedConfig.context_length);
        }
      } catch (e) {
        console.log('[Model Token Limits] Hydration from /api/models failed, falling back to conservative default', e);
      }
    }

    // On server or if hydration didn’t yield a config, return conservative default
    console.log(`[Model Token Limits] Model '${modelId}' not found in store after hydration or running on server. Using conservative default (8K context)`);
    return calculateTokenStrategy(8000);
  } catch (error) {
    console.error(`[Model Token Limits] Error fetching model config for ${modelId}:`, error);
    return calculateTokenStrategy(8000); // Conservative fallback on error
  }
}

/**
 * Validates if a token count fits within the available input budget
 * 
 * @param tokenCount - The number of tokens to check
 * @param strategy - The token strategy to validate against
 * @returns True if tokens fit within input budget
 */
export function isWithinInputBudget(tokenCount: number, strategy: TokenStrategy): boolean {
  const fits = tokenCount <= strategy.maxInputTokens;
  
  console.log(`[Token Budget] ${tokenCount} tokens ${fits ? 'fits within' : 'exceeds'} input budget of ${strategy.maxInputTokens}`);
  
  return fits;
}

/**
 * Gets the maximum output tokens for legacy compatibility
 * Uses the calculated strategy but provides a simple number for existing code
 * 
 * @param modelId - The OpenRouter model ID
 * @returns Maximum output tokens for the model
 */
export async function getMaxOutputTokens(modelId?: string): Promise<number> {
  const strategy = await getModelTokenLimits(modelId);
  const maxTokens = strategy.maxOutputTokens;
  
  console.log(`[Legacy Token Limit] Model ${modelId || 'default'} max output tokens: ${maxTokens}`);
  
  return maxTokens;
}

// Deprecated legacy admin hooks: retain as safe no-ops to avoid breaking health checks
export async function preloadModelConfigs(): Promise<void> {
  logger.info('[Model Configs] preloadModelConfigs is deprecated. Model configs are DB-backed and hydrated on demand via /api/models.');
  configsLastFetched = Date.now();
}

export function getServerCacheStats(): {
  isInitialized: boolean;
  configCount: number;
  ageMinutes: number;
  isExpired: boolean;
} {
  // No server-side OpenRouter cache anymore; report neutral stats
  const ageMinutes = Math.round((Date.now() - configsLastFetched) / 1000 / 60);
  return {
    isInitialized: false,
    configCount: 0,
    ageMinutes,
    isExpired: false,
  };
}

// Back-compat: legacy name used by dev scripts. Hydrates store on client, no-op on server.
export async function refreshModelConfigs(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      await fetchModelsForStore();
      logger.info('[Model Configs] refreshModelConfigs: hydrated from /api/models');
    } else {
      logger.info('[Model Configs] refreshModelConfigs is a no-op on server; configs are DB-backed.');
    }
  } catch {
    logger.warn('[Model Configs] refreshModelConfigs failed to hydrate; continuing with existing cache/defaults');
  } finally {
    configsLastFetched = Date.now();
  }
}
