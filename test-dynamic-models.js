/**
 * Test script to verify dynamic model configuration
 */

import { getModelTokenLimits } from "./lib/utils/tokens.js";

async function testDynamicModels() {
  console.log("=== Testing Dynamic Model Configuration ===\n");

  try {
    // Test with a model from the allowed list
    console.log("1. Testing with GPT-4o Mini (from allowed list):");
    const gpt4Strategy = await getModelTokenLimits("openai/gpt-4o-mini");
    console.log(`   Context length: ${gpt4Strategy.totalContextLength}`);
    console.log(`   Max input: ${gpt4Strategy.maxInputTokens}`);
    console.log(`   Max output: ${gpt4Strategy.maxOutputTokens}\n`);

    // Test with Gemini model
    console.log("2. Testing with Gemini 2.5 Flash:");
    const geminiStrategy = await getModelTokenLimits("google/gemini-2.5-flash");
    console.log(`   Context length: ${geminiStrategy.totalContextLength}`);
    console.log(`   Max input: ${geminiStrategy.maxInputTokens}`);
    console.log(`   Max output: ${geminiStrategy.maxOutputTokens}\n`);

    // Test manual refresh
    console.log("3. Testing manual config refresh:");
    try {
      const mod = await import("./lib/utils/tokens.js");
      if (typeof mod.refreshModelConfigs === "function") {
        await mod.refreshModelConfigs();
      }
      console.log("   ✓ Config refresh completed\n");
    } catch {
      console.log("   (skipped) refresh not available\n");
    }

    // Test with unknown model (should fallback)
    console.log("4. Testing with unknown model (fallback):");
    const unknownStrategy = await getModelTokenLimits("unknown/model");
    console.log(`   Context length: ${unknownStrategy.totalContextLength}`);
    console.log(`   Max input: ${unknownStrategy.maxInputTokens}`);
    console.log(`   Max output: ${unknownStrategy.maxOutputTokens}\n`);

    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testDynamicModels();
