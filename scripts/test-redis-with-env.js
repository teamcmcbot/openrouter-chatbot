// Test Redis with proper environment loading
require("dotenv").config({ path: ".env.local" });
const { Redis } = require("@upstash/redis");

async function testRedis() {
  console.log("🔗 Testing Redis Connection...");
  console.log(
    "📍 URL:",
    process.env.UPSTASH_REDIS_REST_URL?.substring(0, 30) + "..."
  );
  console.log(
    "📍 Token:",
    process.env.UPSTASH_REDIS_REST_TOKEN?.substring(0, 10) + "..."
  );

  try {
    const redis = Redis.fromEnv();

    // Test basic connection
    console.log("📝 Setting test key...");
    await redis.set("test-key", "hello-redis");

    console.log("📖 Reading test key...");
    const value = await redis.get("test-key");

    console.log("🧹 Cleaning up...");
    await redis.del("test-key");

    if (value === "hello-redis") {
      console.log("✅ SUCCESS! Redis is connected and working!");
      console.log("   - Can write data ✅");
      console.log("   - Can read data ✅");
      console.log("   - Can delete data ✅");
      console.log("\n🎉 Your rate limiting will work properly!");
    } else {
      console.log("❌ FAILED! Read/write test failed");
    }
  } catch (error) {
    console.log("❌ FAILED! Redis connection error:", error.message);
    console.log("\n🔧 Troubleshooting:");
    console.log("   1. Check your Upstash dashboard");
    console.log("   2. Verify credentials in .env.local");
    console.log("   3. Make sure Redis instance is active");
  }
}

testRedis();
