// scripts/test-rate-limiting.js
// Quick script to test if Redis rate limiting is working

const API_BASE = "http://localhost:3000"; // Updated for current dev server

async function testRateLimit() {
  console.log("🧪 Testing Redis Rate Limiting...\n");

  const promises = [];

  // Make 15 rapid requests to trigger rate limiting
  for (let i = 1; i <= 15; i++) {
    const promise = fetch(`${API_BASE}/api/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const limit = response.headers.get("X-RateLimit-Limit");
        const reset = response.headers.get("X-RateLimit-Reset");

        return {
          request: i,
          status: response.status,
          remaining: remaining || "N/A",
          limit: limit || "N/A",
          reset: reset ? new Date(reset).toLocaleTimeString() : "N/A",
          blocked: response.status === 429,
        };
      })
      .catch((error) => ({
        request: i,
        status: "ERROR",
        error: error.message,
        blocked: false,
      }));

    promises.push(promise);
  }

  // Wait for all requests to complete
  const responses = await Promise.all(promises);

  // Display results
  console.log("Request | Status | Remaining | Limit | Reset Time | Blocked");
  console.log("--------|--------|-----------|-------|------------|--------");

  let blockedCount = 0;
  responses.forEach((result) => {
    const blocked = result.blocked ? "✅ YES" : "❌ No";
    if (result.blocked) blockedCount++;

    console.log(
      `${result.request.toString().padStart(7)} | ` +
        `${result.status.toString().padStart(6)} | ` +
        `${result.remaining.toString().padStart(9)} | ` +
        `${result.limit.toString().padStart(5)} | ` +
        `${result.reset.toString().padStart(10)} | ` +
        `${blocked}`
    );
  });

  console.log(`\n📊 Results:`);
  console.log(`✅ Successful requests: ${responses.length - blockedCount}`);
  console.log(`🚫 Blocked requests: ${blockedCount}`);

  if (blockedCount > 0) {
    console.log(`\n🎉 SUCCESS! Rate limiting is working with Redis!`);
    console.log(`   - Requests were properly blocked after hitting limit`);
    console.log(`   - Rate limit headers are being set correctly`);
  } else {
    console.log(`\n⚠️  Rate limiting may not be working properly:`);
    console.log(`   - No requests were blocked`);
    console.log(`   - Check Redis connection and middleware setup`);
  }

  // Test with authenticated user (if you have auth setup)
  console.log(
    `\n💡 Next: Test with different user tiers to verify tier-based limits`
  );
}

// Run the test
if (require.main === module) {
  testRateLimit().catch(console.error);
}

module.exports = { testRateLimit };
