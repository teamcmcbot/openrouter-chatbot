#!/usr/bin/env node

/**
 * Test script for Phase 1 streaming endpoint verification
 *
 * This script tests the /api/chat/stream endpoint with various scenarios:
 * - Authentication and rate limiting
 * - Different models and temperature settings
 * - Web search and reasoning features
 * - User tiers and feature flags
 * - Error handling and edge cases
 *
 * Usage: node scripts/test-streaming.js [--local|--prod] [--verbose]
 */

const https = require("https");
const http = require("http");

const args = process.argv.slice(2);
const isLocal = args.includes("--local") || !args.includes("--prod");
const verbose = args.includes("--verbose");

// Test configuration
const config = {
  baseUrl: isLocal
    ? "http://localhost:3000"
    : process.env.VERCEL_URL || "https://your-app.vercel.app",
  timeout: 30000, // 30 seconds
};

console.log(`🧪 Testing streaming endpoint: ${config.baseUrl}/api/chat/stream`);
console.log(`📝 Verbose mode: ${verbose ? "ON" : "OFF"}`);
console.log("");

// Test cases
const testCases = [
  {
    name: "🔐 Anonymous user - basic streaming",
    description: "Test streaming with anonymous user (no auth)",
    payload: {
      message: "Hello, can you help me with a simple question?",
      model: "deepseek/deepseek-r1-0528:free",
      temperature: 0.7,
    },
    headers: {},
    expectedStatus: [200],
    expectStream: true,
  },
  {
    name: "🔒 Rate limiting test",
    description:
      "Test TierA rate limiting (should share limits with /api/chat)",
    payload: {
      message: "Quick test message",
      model: "deepseek/deepseek-r1-0528:free",
    },
    headers: {},
    expectedStatus: [200, 429], // Success or rate limited
    expectStream: true,
    repeat: 3, // Test multiple requests quickly
  },
  {
    name: "📊 Model validation",
    description: "Test with different model formats",
    payload: {
      message: "Test message",
      model: "gpt-3.5-turbo", // Should be blocked for anonymous users in some configurations
    },
    headers: {},
    expectedStatus: [200, 403], // Success or forbidden
    expectStream: true,
  },
  {
    name: "🌡️ Temperature validation",
    description: "Test temperature parameter handling",
    payload: {
      message: "Creative writing test",
      model: "deepseek/deepseek-r1-0528:free",
      temperature: 1.2,
    },
    headers: {},
    expectedStatus: [200],
    expectStream: true,
  },
  {
    name: "🔍 Web search test (should fail for anonymous)",
    description: "Test web search feature gating",
    payload: {
      message: "What is the latest news about AI?",
      model: "deepseek/deepseek-r1-0528:free",
      webSearch: true,
    },
    headers: {},
    expectedStatus: [403], // Should be forbidden for anonymous users
    expectStream: false,
  },
  {
    name: "🧠 Reasoning test (should fail for non-enterprise)",
    description: "Test reasoning feature gating",
    payload: {
      message: "Solve this math problem: 2x + 5 = 13",
      model: "deepseek/deepseek-r1-0528:free",
      reasoning: { effort: "medium" },
    },
    headers: {},
    expectedStatus: [403], // Should be forbidden for non-enterprise
    expectStream: false,
  },
  {
    name: "📝 Legacy message format",
    description: "Test backward compatibility with legacy format",
    payload: {
      message: "Test legacy format",
      model: "deepseek/deepseek-r1-0528:free",
    },
    headers: {},
    expectedStatus: [200],
    expectStream: true,
  },
  {
    name: "📋 New message format",
    description: "Test new messages array format",
    payload: {
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ],
      model: "deepseek/deepseek-r1-0528:free",
    },
    headers: {},
    expectedStatus: [200],
    expectStream: true,
  },
];

/**
 * Make HTTP request and handle streaming response
 */
function makeRequest(testCase) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/chat/stream", config.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const postData = JSON.stringify(testCase.payload);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        ...testCase.headers,
      },
      timeout: config.timeout,
    };

    const req = httpModule.request(options, (res) => {
      let data = "";
      let chunks = [];

      const result = {
        status: res.statusCode,
        headers: res.headers,
        streaming: false,
        chunks: 0,
        totalLength: 0,
        responseTime: Date.now(),
      };

      res.on("data", (chunk) => {
        chunks.push(chunk);
        data += chunk.toString();
        result.chunks++;
        result.totalLength += chunk.length;

        if (result.chunks > 1) {
          result.streaming = true;
        }

        if (verbose && testCase.expectStream) {
          process.stdout.write(".");
        }
      });

      res.on("end", () => {
        result.responseTime = Date.now() - result.responseTime;
        result.data = data;

        if (verbose && testCase.expectStream) {
          console.log(""); // New line after dots
        }

        resolve(result);
      });
    });

    req.on("error", reject);
    req.on("timeout", () => reject(new Error("Request timeout")));
    req.write(postData);
    req.end();
  });
}

/**
 * Run a single test case
 */
async function runTest(testCase, index) {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   ${testCase.description}`);

  const repeat = testCase.repeat || 1;
  let results = [];

  for (let i = 0; i < repeat; i++) {
    if (repeat > 1) {
      console.log(`   Attempt ${i + 1}/${repeat}:`);
    }

    try {
      const result = await makeRequest(testCase);
      results.push(result);

      // Check status code
      const statusOk = testCase.expectedStatus.includes(result.status);
      const statusIcon = statusOk ? "✅" : "❌";

      // Check streaming behavior
      const streamOk = testCase.expectStream
        ? result.streaming
        : !result.streaming;
      const streamIcon = streamOk ? "✅" : "❌";

      console.log(
        `   ${statusIcon} Status: ${
          result.status
        } (expected: ${testCase.expectedStatus.join(" or ")})`
      );
      console.log(
        `   ${streamIcon} Streaming: ${result.streaming} (expected: ${testCase.expectStream})`
      );
      console.log(`   ⏱️  Response time: ${result.responseTime}ms`);
      console.log(
        `   📦 Chunks: ${result.chunks}, Total size: ${result.totalLength} bytes`
      );

      if (result.headers["x-model"]) {
        console.log(`   🤖 Model: ${result.headers["x-model"]}`);
      }

      if (result.headers["x-streaming"]) {
        console.log(`   🔄 X-Streaming: ${result.headers["x-streaming"]}`);
      }

      // Check for rate limiting headers
      if (result.headers["x-ratelimit-remaining"]) {
        console.log(
          `   📊 Rate limit remaining: ${result.headers["x-ratelimit-remaining"]}`
        );
      }

      if (verbose) {
        console.log(
          `   📝 Response preview: ${result.data.substring(0, 100)}...`
        );
      }

      // Brief delay between repeated requests
      if (i < repeat - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({ error: error.message });
    }
  }

  return results;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log("🚀 Starting Phase 1 streaming endpoint verification...\n");

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const results = await runTest(testCase, i);

    // Evaluate test results
    const allSucceeded = results.every((result) => {
      if (result.error) return false;

      const statusOk = testCase.expectedStatus.includes(result.status);
      const streamOk = testCase.expectStream
        ? result.streaming
        : !result.streaming;

      return statusOk && streamOk;
    });

    if (allSucceeded) {
      passed++;
    } else {
      failed++;
    }
  }

  const totalTime = Date.now() - startTime;

  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(
    `🎯 Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`
  );

  if (failed === 0) {
    console.log(
      "\n🎉 All tests passed! Phase 1 streaming endpoint is ready for production."
    );
  } else {
    console.log(
      "\n⚠️  Some tests failed. Please review the issues above before proceeding to Phase 2."
    );
  }

  console.log("\n📋 Next steps:");
  console.log(
    "   1. If tests pass: Proceed to Phase 2 (frontend streaming implementation)"
  );
  console.log("   2. If tests fail: Fix issues and re-run tests");
  console.log(
    "   3. Test with authenticated users to verify tier-based features"
  );

  process.exit(failed === 0 ? 0 : 1);
}

// Run the tests
runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
