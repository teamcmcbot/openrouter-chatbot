/**
 * Token estimation and management utilities for context-aware chat
 * 
 * This module provides functions to estimate token counts and calculate
 * model-aware token allocation strategies for OpenRouter API calls.
 */

import { ChatMessage } from '../types/chat';

// Server-side model context configurations
// This is a subset of model info for token calculation purposes
const SERVER_SIDE_MODEL_CONFIGS: Record<string, { context_length: number; description: string }> = {
  'openai/gpt-4o-mini': { context_length: 128000, description: 'GPT-4o Mini' },
  'openai/gpt-4o': { context_length: 128000, description: 'GPT-4o' },
  'google/gemini-2.0-flash-exp:free': { context_length: 1000000, description: 'Gemini 2.0 Flash' },
  'google/gemini-2.5-flash': { context_length: 1000000, description: 'Gemini 2.5 Flash' },
  'google/gemma-3-27b-it:free': { context_length: 8192, description: 'Gemma 3 27B' },
  'deepseek/deepseek-r1-0528:free': { context_length: 128000, description: 'DeepSeek R1' },
  'deepseek/deepseek-r1-0528-qwen3-8b:free': { context_length: 32768, description: 'DeepSeek R1 Qwen3' },
  'openrouter/cypher-alpha:free': { context_length: 32768, description: 'Cypher Alpha' },
  'mistralai/mistral-small-3.2-24b-instruct:free': { context_length: 32768, description: 'Mistral Small' },
  'moonshotai/kimi-dev-72b:free': { context_length: 128000, description: 'Kimi Dev 72B' },
  'x-ai/grok-3-mini': { context_length: 128000, description: 'Grok 3 Mini' },
};

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
 * Gets token limits for a specific model using the model store
 * Falls back to conservative defaults if model info is not available
 * 
 * @param modelId - The OpenRouter model ID
 * @returns Token strategy for the specified model
 */
export function getModelTokenLimits(modelId?: string): TokenStrategy {
  console.log(`[Model Token Limits] Looking up limits for model: ${modelId || 'default'}`);
  
  if (!modelId) {
    console.log(`[Model Token Limits] No model specified, using conservative default (8K context)`);
    return calculateTokenStrategy(8000); // Conservative default
  }
  
  // Get model info from server-side configuration
  const modelConfig = SERVER_SIDE_MODEL_CONFIGS[modelId];
  
  if (!modelConfig) {
    console.log(`[Model Token Limits] Model '${modelId}' not found in server config, using conservative default (8K context)`);
    return calculateTokenStrategy(8000); // Conservative fallback
  }
  
  console.log(`[Model Token Limits] Found ${modelConfig.description} with ${modelConfig.context_length} context length`);
  
  const contextLength = modelConfig.context_length;
  console.log(`[Model Token Limits] Found model ${modelId} with context length: ${contextLength}`);
  
  return calculateTokenStrategy(contextLength);
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
export function getMaxOutputTokens(modelId?: string): number {
  const strategy = getModelTokenLimits(modelId);
  const maxTokens = strategy.maxOutputTokens;
  
  console.log(`[Legacy Token Limit] Model ${modelId || 'default'} max output tokens: ${maxTokens}`);
  
  return maxTokens;
}
