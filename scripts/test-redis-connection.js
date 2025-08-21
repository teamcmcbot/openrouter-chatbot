// Quick Redis connection test
const { Redis } = require("@upstash/redis");

async function testRedis() {
  console.log("🔗 Testing Redis Connection...");

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
    } else {
      console.log("❌ FAILED! Read/write test failed");
    }
  } catch (error) {
    console.log("❌ FAILED! Redis connection error:", error.message);
    console.log("\n🔧 Check your .env.local file:");
    console.log("   - UPSTASH_REDIS_REST_URL");
    console.log("   - UPSTASH_REDIS_REST_TOKEN");
  }
}

testRedis();
