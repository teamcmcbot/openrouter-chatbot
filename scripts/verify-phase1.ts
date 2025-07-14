/**
 * Phase 1 Human Verification Script
 * Run this to verify token estimation and allocation is working correctly
 */

import {
  estimateTokenCount,
  estimateMessagesTokens,
  calculateTokenStrategy,
  isWithinInputBudget,
  getMaxOutputTokens
} from '../lib/utils/tokens';
import { ChatMessage } from '../lib/types/chat';

async function runVerification() {
console.log('=== Phase 1: Token Management Foundation - Human Verification ===\n');

// Test 1: Basic token estimation
console.log('1. Basic Token Estimation Tests:');
const shortText = 'Hello world!';
const longText = 'This is a longer text message that should demonstrate the token estimation algorithm working correctly with various message lengths.';

console.log(`   Short text: "${shortText}"`);
const shortTokens = estimateTokenCount(shortText);

console.log(`   Long text: "${longText}"`);
const longTokens = estimateTokenCount(longText);

// Test 2: Message array estimation
console.log('\n2. Message Array Token Estimation:');
const testMessages: ChatMessage[] = [
  {
    id: '1',
    content: 'What is the capital of France?',
    role: 'user',
    timestamp: new Date()
  },
  {
    id: '2',
    content: 'The capital of France is Paris. It is a beautiful city with rich history, amazing architecture, and world-class museums like the Louvre.',
    role: 'assistant',
    timestamp: new Date()
  },
  {
    id: '3',
    content: 'Can you tell me more about its history?',
    role: 'user',
    timestamp: new Date()
  }
];

console.log(`   Testing with ${testMessages.length} messages:`);
const totalMessageTokens = estimateMessagesTokens(testMessages);

// Test 3: Token strategy for different model sizes
console.log('\n3. Token Strategy Calculations:');

console.log('   Small model (8K context):');
const smallModelStrategy = calculateTokenStrategy(8000);

console.log('   Medium model (32K context):');
const mediumModelStrategy = calculateTokenStrategy(32000);

console.log('   Large model (128K context):');
const largeModelStrategy = calculateTokenStrategy(128000);

// Test 4: Budget validation
console.log('\n4. Budget Validation Tests:');
console.log(`   Can ${totalMessageTokens} tokens fit in small model input budget?`);
const fitsSmall = isWithinInputBudget(totalMessageTokens, smallModelStrategy);

console.log(`   Can ${totalMessageTokens} tokens fit in medium model input budget?`);
const fitsMedium = isWithinInputBudget(totalMessageTokens, mediumModelStrategy);

// Test 5: Legacy compatibility
console.log('\n5. Legacy Compatibility:');
const legacyMaxTokens = await getMaxOutputTokens();
console.log(`   Legacy max tokens (no model specified): ${legacyMaxTokens}`);

console.log('\n=== Verification Summary ===');
console.log(`✓ Token estimation functional: ${shortTokens > 0 && longTokens > shortTokens}`);
console.log(`✓ Message token calculation: ${totalMessageTokens > 0}`);
console.log(`✓ Strategy scaling works: ${largeModelStrategy.maxInputTokens > mediumModelStrategy.maxInputTokens && mediumModelStrategy.maxInputTokens > smallModelStrategy.maxInputTokens}`);
console.log(`✓ Budget validation works: ${fitsMedium && (fitsSmall || totalMessageTokens <= smallModelStrategy.maxInputTokens)}`);
console.log(`✓ Legacy compatibility: ${legacyMaxTokens > 0}`);

console.log('\n🎯 Phase 1 verification complete! Check the detailed logs above.');
console.log('Ready for human review and checkpoint commit.');
}

// Run the verification
runVerification().catch(console.error);
