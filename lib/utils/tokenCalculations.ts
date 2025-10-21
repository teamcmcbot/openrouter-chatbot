/**
 * Token calculation utilities for consistent token display across the frontend.
 * These functions handle the breakdown of tokens into text vs image components
 * for better user understanding of model costs and usage.
 */

/**
 * Calculate text output tokens with provider-aware logic.
 * 
 * Provider-specific token accounting:
 * - OpenAI: native_tokens_completion (text only) + native_tokens_completion_images (images separately)
 *   → Do NOT subtract - completion tokens already exclude images
 * - Google: native_tokens_completion (includes images) = native_tokens_completion_images
 *   → DO subtract to get text-only tokens
 * 
 * This prevents negative token values when displaying OpenAI image generation costs.
 * Example: OpenAI returns completion_tokens=1114 (text only), image_tokens=4175 (images separately)
 * - Old logic: 1114 - 4175 = -3061 ❌
 * - New logic: 1114 (no subtraction for OpenAI) ✅
 * 
 * @param outputTokens Output/completion tokens from the model (native_tokens_completion)
 * @param imageTokens Image generation tokens (native_tokens_completion_images)
 * @param totalTokens Total tokens (optional, for legacy detection)
 * @param modelId Model identifier (e.g., "openai/gpt-5-image", "google/gemini-2.0-flash-exp")
 * @returns Text output tokens (always >= 0)
 */
import { logger } from "./logger";

export function calculateTextOutputTokens(
  outputTokens?: number,
  imageTokens?: number,
  totalTokens?: number,
  modelId?: string
): number {
  // If we have no image tokens, just return output tokens
  if (!imageTokens || imageTokens === 0) {
    return outputTokens || 0;
  }
  
  // OpenAI image generation models: completion tokens already exclude images
  // Return as-is without subtraction to prevent negative values
  const isOpenAI = modelId?.startsWith('openai/');
  if (isOpenAI) {
    logger.debug('calculateTextOutputTokens: OpenAI provider detected - no subtraction', { 
      outputTokens, imageTokens, modelId 
    });
    return outputTokens || 0;
  }
  
  // Google/other providers: completion tokens include images
  // Subtract image tokens from total output tokens to get text-only
  const result = Math.max(0, (outputTokens || 0) - imageTokens);
  logger.debug('calculateTextOutputTokens: Google/other provider - subtracting image tokens', { 
    outputTokens, imageTokens, totalTokens, modelId, result 
  });
  return result;
}

/**
 * Determine if a message has image tokens that should be displayed separately.
 * Only show image token breakdown if there are actually image tokens present.
 * 
 * @param imageTokens Image generation tokens
 * @returns Whether to show image token breakdown in UI
 */
export function shouldShowImageTokens(imageTokens: number | undefined): boolean {
  return Number.isFinite(imageTokens) && imageTokens! > 0;
}

/**
 * Correct token values from API responses with provider-aware logic.
 * This function applies the same provider-specific corrections to token values
 * that will be stored in the database and displayed to users.
 * 
 * OpenAI models with image generation:
 * - output_tokens: Already text-only from API, keep as-is
 * - total_tokens: API returns incorrect value, recalculate as input + text + images
 * 
 * Other providers (Google):
 * - output_tokens: Includes images, subtract to get text-only
 * - total_tokens: Use API value (already correct)
 * 
 * @param usage Token usage object from API response
 * @param modelId Model identifier
 * @returns Corrected token values for storage/display
 */
export function correctTokensForProvider(
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      image_tokens?: number;
    };
  },
  modelId?: string
): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  output_image_tokens?: number;
} {
  const input_tokens = usage.prompt_tokens || 0;
  const output_tokens_raw = usage.completion_tokens || 0;
  const total_tokens_raw = usage.total_tokens || 0;
  const output_image_tokens = usage.completion_tokens_details?.image_tokens;
  
  const isOpenAI = modelId?.startsWith('openai/');
  const hasImageTokens = output_image_tokens && output_image_tokens > 0;
  
  if (isOpenAI && hasImageTokens) {
    // OpenAI: completion_tokens is text-only, recalculate total
    const corrected_total = input_tokens + output_tokens_raw + output_image_tokens;
    logger.debug('correctTokensForProvider: OpenAI image model correction', {
      modelId,
      input_tokens,
      output_tokens: output_tokens_raw,
      output_image_tokens,
      total_before: total_tokens_raw,
      total_after: corrected_total
    });
    return {
      input_tokens,
      output_tokens: output_tokens_raw, // Keep as-is (text-only)
      total_tokens: corrected_total,     // Recalculated
      output_image_tokens
    };
  }
  
  if (!isOpenAI && hasImageTokens) {
    // Google/others: completion_tokens includes images, subtract for text-only
    const text_output = Math.max(0, output_tokens_raw - output_image_tokens);
    logger.debug('correctTokensForProvider: Google/other provider correction', {
      modelId,
      input_tokens,
      output_tokens_before: output_tokens_raw,
      output_tokens_after: text_output,
      output_image_tokens,
      total_tokens: total_tokens_raw
    });
    return {
      input_tokens,
      output_tokens: text_output,        // Subtract images
      total_tokens: total_tokens_raw,    // Use API value
      output_image_tokens
    };
  }
  
  // No image tokens or no special handling needed
  return {
    input_tokens,
    output_tokens: output_tokens_raw,
    total_tokens: total_tokens_raw,
    ...(output_image_tokens && { output_image_tokens })
  };
}

/**
 * Format token information for display in chat messages.
 * Returns an object with formatted token counts and display flags.
 * 
 * @param inputTokens Input/prompt tokens
 * @param outputTokens Total output/completion tokens
 * @param totalTokens Total tokens (input + output)
 * @param imageTokens Image generation tokens
 * @param modelId Model identifier for provider-aware calculation
 * @returns Formatted token display information
 */
export function formatTokenDisplay(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
  imageTokens: number | undefined,
  modelId?: string
) {
  const input = inputTokens || 0;
  const output = outputTokens || 0;
  const image = imageTokens || 0;
  
  const hasImageTokens = shouldShowImageTokens(imageTokens);
  const textOutput = calculateTextOutputTokens(outputTokens, imageTokens, totalTokens, modelId);
  
  // Recalculate total for OpenAI image models (API returns incorrect total)
  // OpenAI: total = input + text + images (additive)
  // Others: use API's total_tokens (already correct)
  let total = totalTokens || 0;
  const isOpenAI = modelId?.startsWith('openai/');
  if (isOpenAI && hasImageTokens) {
    total = input + textOutput + image;
    logger.debug('formatTokenDisplay: Recalculated total for OpenAI image model', {
      modelId, input, textOutput, image, calculatedTotal: total, apiTotal: totalTokens
    });
  }
  
  return {
    input,
    output,
    total,
    image,
    textOutput,
    hasImageTokens,
    // Whether to show detailed breakdown (when there are image tokens)
    showDetailed: hasImageTokens
  };
}
