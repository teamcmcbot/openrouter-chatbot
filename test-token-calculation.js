// Quick test for the token calculation logic
const {
  calculateTextOutputTokens,
} = require("./lib/utils/tokenCalculations.ts");

// Test cases for the detection logic
console.log("Testing token calculation logic...\n");

// Database case - tokens already separated
const dbCase = {
  output_tokens: 198,
  output_image_tokens: 1290,
  total_tokens: 1768,
};

const dbResult = calculateTextOutputTokens(
  dbCase.output_tokens,
  dbCase.output_image_tokens,
  dbCase.total_tokens
);

console.log("Database case (separated tokens):");
console.log(
  `Input: output_tokens=${dbCase.output_tokens}, output_image_tokens=${dbCase.output_image_tokens}, total_tokens=${dbCase.total_tokens}`
);
console.log(`Result: ${dbResult}`);
console.log(`Expected: 198\n`);

// Real-time case - tokens combined
const realtimeCase = {
  output_tokens: 1488, // combined text + image tokens
  output_image_tokens: 1290,
  total_tokens: 1768,
};

const realtimeResult = calculateTextOutputTokens(
  realtimeCase.output_tokens,
  realtimeCase.output_image_tokens,
  realtimeCase.total_tokens
);

console.log("Real-time case (combined tokens):");
console.log(
  `Input: output_tokens=${realtimeCase.output_tokens}, output_image_tokens=${realtimeCase.output_image_tokens}, total_tokens=${realtimeCase.total_tokens}`
);
console.log(`Result: ${realtimeResult}`);
console.log(`Expected: 198 (1488 - 1290)\n`);

// Edge case - no image tokens
const noImageCase = {
  output_tokens: 150,
  output_image_tokens: 0,
  total_tokens: 430,
};

const noImageResult = calculateTextOutputTokens(
  noImageCase.output_tokens,
  noImageCase.output_image_tokens,
  noImageCase.total_tokens
);

console.log("No image case:");
console.log(
  `Input: output_tokens=${noImageCase.output_tokens}, output_image_tokens=${noImageCase.output_image_tokens}, total_tokens=${noImageCase.total_tokens}`
);
console.log(`Result: ${noImageResult}`);
console.log(`Expected: 150\n`);
