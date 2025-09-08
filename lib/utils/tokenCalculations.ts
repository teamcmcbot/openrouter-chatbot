/**
 * Token calculation utilities for consistent token display across the frontend.
 * These functions handle the breakdown of tokens into text vs image components
 * for better user understanding of model costs and usage.
 */

/**
 * Calculate text output tokens by subtracting image tokens from total output tokens.
 * 
 * For messages with image generation, there are two scenarios:
 * 1. Real-time responses: output_tokens includes both text + image, need to subtract
 * 2. Database/history: output_tokens already separated (text only), use as-is
 * 
 * We detect this by checking if output_tokens + image_tokens ≈ total_tokens
 * If yes, then output_tokens already separated; if no, then combined.
 * 
 * @param outputTokens Output/completion tokens from the model
 * @param imageTokens Image generation tokens (from completion_tokens_details.image_tokens)
 * @param totalTokens Total tokens for detection (optional)
 * @returns Text output tokens (always >= 0)
 */
import { logger } from "./logger";

export function calculateTextOutputTokens(
  outputTokens?: number,
  imageTokens?: number,
  totalTokens?: number
): number {
  // For database responses, output_tokens and output_image_tokens are already separated
  // For real-time responses, output_tokens contains both text and image tokens combined
  
  // If we have no image tokens, just return output tokens
  if (!imageTokens || imageTokens === 0) {
    return outputTokens || 0;
  }
  
  // If we don't have total_tokens for detection, assume real-time case (subtract)
  if (!totalTokens || totalTokens === 0) {
    return Math.max(0, (outputTokens || 0) - imageTokens);
  }
  
  // Database detection: in database, total_tokens = input_tokens + output_tokens + output_image_tokens
  // If output_tokens + output_image_tokens is reasonably close to total_tokens, but not exact,
  // it suggests input_tokens are included in total, meaning tokens are separated (database case)
  const outputSum = (outputTokens || 0) + imageTokens;
  
  // If the output sum is between 50% and 95% of total tokens, it's likely database case
  // (the remaining would be input tokens)
  if (outputSum >= totalTokens * 0.5 && outputSum <= totalTokens * 0.95) {
    // Database case: tokens already separated
    logger.debug('calculateTextOutputTokens: Database case detected', { 
      outputTokens, imageTokens, totalTokens, outputSum 
    });
    return outputTokens || 0;
  }
  
  // Real-time case: subtract image tokens from combined output tokens
  const result = Math.max(0, (outputTokens || 0) - imageTokens);
  logger.debug('calculateTextOutputTokens: Real-time case detected', { 
    outputTokens, imageTokens, totalTokens, result 
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
 * Format token information for display in chat messages.
 * Returns an object with formatted token counts and display flags.
 * 
 * @param inputTokens Input/prompt tokens
 * @param outputTokens Total output/completion tokens
 * @param totalTokens Total tokens (input + output)
 * @param imageTokens Image generation tokens
 * @returns Formatted token display information
 */
export function formatTokenDisplay(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
  imageTokens: number | undefined
) {
  const input = inputTokens || 0;
  const output = outputTokens || 0;
  const total = totalTokens || 0;
  const image = imageTokens || 0;
  
  const hasImageTokens = shouldShowImageTokens(imageTokens);
  const textOutput = calculateTextOutputTokens(outputTokens, imageTokens, totalTokens);
  
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
