# Redis Rate Limiting Troubleshooting Guide

This guide covers common issues, debugging steps, and solutions for Redis-based rate limiting in the OpenRouter Chatbot.

## Common Issues

### 1. Redis Connection Failed

**Error**: `Failed to connect to Redis` or `Redis timeout`

#### Symptoms:

- API requests work but no rate limiting
- Console errors about Redis connection
- Rate limiting headers missing from responses

#### Debugging Steps:

1. **Check Environment Variables**:

```bash
# Verify variables are set
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN

# In production, check Vercel environment variables
vercel env ls
```

2. **Test Redis Connection**:

```bash
# Run connection test script
node scripts/test-redis-connection.js

# Expected output:
# ✅ Redis connection successful!
# Set test key: OK
# Retrieved test key: test-value
```

3. **Check Upstash Dashboard**:

- Go to [Upstash Console](https://console.upstash.com/)
- Verify database is active and running
- Check if you've hit free tier limits

#### Solutions:

**Missing Environment Variables**:

```bash
# Add to .env.local
UPSTASH_REDIS_REST_URL=https://your-database-id.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

**Wrong URL/Token**:

1. Go to Upstash Console → Your Database → REST API tab
2. Copy the exact URL and token
3. Update environment variables

**Free Tier Limit Exceeded**:

- Free tier: 10,000 commands/day
- Solution: Upgrade to pay-as-you-go or wait for reset

---

### 2. Rate Limiting Not Working

**Symptoms**: Can make unlimited requests without being blocked

#### Debugging Steps:

1. **Check Middleware Applied**:

```bash
# Search for withRedisRateLimit usage
grep -r "withRedisRateLimit" src/app/api/
```

2. **Verify Request Headers**:

```bash
# Make a test request and check headers
curl -v http://localhost:3000/api/chat/sessions

# Look for these headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: 3600
```

3. **Check Console Logs**:

```bash
# Look for rate limiting debug logs
npm run dev
# Make requests and check console output
```

#### Solutions:

**Middleware Not Applied**:

```typescript
// Make sure route uses withRedisRateLimit
import { withRedisRateLimit } from "../../../lib/middleware/redisRateLimitMiddleware";

// Correct usage:
export const POST = withProtectedAuth(withRedisRateLimit(handler));
```

**Wrong Import**:

```typescript
// OLD (broken):
import { withRateLimit } from "../../../lib/middleware/rateLimitMiddleware";

// NEW (working):
import { withRedisRateLimit } from "../../../lib/middleware/redisRateLimitMiddleware";
```

---

### 3. High Redis Command Usage

**Warning**: Approaching or exceeding expected command usage

#### Expected Usage:

- 4 commands per API request (normal)
- 10,000 commands/day on free tier
- ~2,500 API requests/day maximum on free tier

#### Debugging Steps:

1. **Check Upstash Dashboard**:

- Monitor commands per day
- Look for usage spikes
- Check command history

2. **Analyze Request Patterns**:

```bash
# Check for automated requests or loops
grep "rate limit" logs/vercel-functions.log
```

3. **Monitor API Usage**:

```typescript
// Add logging to track requests
console.log("API request:", req.url, "User:", user?.id);
```

#### Solutions:

**Automated Testing**:

- Exclude test environments from rate limiting
- Use test-specific Redis database
- Implement test mode bypass

**Request Loops**:

- Check for infinite retry loops in frontend
- Verify error handling doesn't trigger excessive requests
- Add circuit breaker pattern

**Legitimate High Usage**:

- Upgrade to pay-as-you-go plan
- Consider caching strategies
- Optimize API call patterns

---

### 4. Slow API Performance

**Symptoms**: API requests taking longer than expected

#### Expected Performance:

- Redis operations: 5-20ms (regional), 20-50ms (global)
- Total rate limiting overhead: <30ms

#### Debugging Steps:

1. **Measure Redis Response Time**:

```typescript
// Add timing to middleware
const start = Date.now();
const result = await checkRateLimit(userId);
const duration = Date.now() - start;
console.log(`Redis rate limit check: ${duration}ms`);
```

2. **Check Upstash Dashboard**:

- Monitor response times
- Look for performance alerts
- Check database region vs. deployment region

3. **Profile API Requests**:

```bash
# Use Vercel analytics or add custom timing
console.time('api-request');
// ... API logic
console.timeEnd('api-request');
```

#### Solutions:

**High Latency**:

- Consider upgrading to Global Redis for worldwide users
- Move to same region as your Vercel deployment
- Check network connectivity issues

**Database Overload**:

- Review rate limiting frequency
- Implement request batching if possible
- Consider Redis connection pooling

---

### 5. Rate Limiting Headers Missing

**Symptoms**: Responses don't include rate limiting information

#### Expected Headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 3600
```

#### Debugging Steps:

1. **Check Middleware Order**:

```typescript
// Correct order:
export const POST = withProtectedAuth(withRedisRateLimit(handler));

// Incorrect - headers might be stripped:
export const POST = withRedisRateLimit(withProtectedAuth(handler));
```

2. **Verify Header Setting**:

```typescript
// In middleware, ensure headers are set:
response.headers.set("X-RateLimit-Limit", limit.toString());
response.headers.set("X-RateLimit-Remaining", remaining.toString());
```

#### Solutions:

**Middleware Order Issues**:

- Always apply withRedisRateLimit after authentication middleware
- Ensure it's the outermost wrapper

**Header Conflicts**:

- Check for other middleware modifying headers
- Verify Next.js isn't stripping custom headers

---

### 6. Development vs Production Differences

**Issue**: Works in development but not in production

#### Debugging Steps:

1. **Environment Variables**:

```bash
# Check production environment variables
vercel env ls

# Compare with local
cat .env.local
```

2. **Different Redis Databases**:

- Development: Uses one Upstash database
- Production: Should use same database or separate prod database

3. **Network Restrictions**:

- Check if production has different network policies
- Verify Upstash access from Vercel regions

#### Solutions:

**Missing Production Env Vars**:

```bash
# Add to Vercel project
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
```

**Different Databases**:

- Use same database for dev/prod (simple)
- Or create separate prod database with same config

---

## Monitoring and Alerts

### 1. Set Up Upstash Alerts

1. Go to Upstash Console → Your Database
2. Set up alerts for:
   - Command usage approaching limits
   - Error rate increases
   - Response time spikes

### 2. Custom Monitoring

```typescript
// Add to your admin endpoints
export async function GET() {
  const stats = {
    redisConnections: await testRedisConnection(),
    rateLimitStats: await getRateLimitStats(),
    errorCount: await getErrorCount(),
  };

  return Response.json(stats);
}
```

### 3. Vercel Function Logs

```bash
# View real-time logs
vercel logs --follow

# Filter for rate limiting
vercel logs | grep "rate limit"
```

## Performance Optimization

### 1. Redis Connection Reuse

The `@upstash/redis` client handles connection pooling automatically, but ensure you're not creating multiple instances:

```typescript
// Good: Single Redis instance
import { redis } from "../../../lib/redis";

// Avoid: Creating multiple instances
// const redis = new Redis({ url, token }); // Don't do this in every request
```

### 2. Batch Operations

If you need multiple Redis operations, use pipelines:

```typescript
// Instead of multiple calls:
await redis.get(key1);
await redis.get(key2);

// Use pipeline:
const pipeline = redis.pipeline();
pipeline.get(key1);
pipeline.get(key2);
const results = await pipeline.exec();
```

### 3. Monitoring Best Practices

- Monitor Redis response times
- Set up alerts for error rates
- Track command usage trends
- Monitor rate limit hit rates

## Emergency Procedures

### 1. Disable Rate Limiting

If rate limiting is causing critical issues:

```typescript
// Temporary bypass (emergency only)
const BYPASS_RATE_LIMITING = process.env.BYPASS_RATE_LIMITING === "true";

export const POST = BYPASS_RATE_LIMITING
  ? withProtectedAuth(handler)
  : withProtectedAuth(withRedisRateLimit(handler));
```

### 2. Fallback to Anonymous Limits

```typescript
// If user tier detection fails, fallback to anonymous limits
const getRateLimit = (user: User | null) => {
  try {
    return getUserTierLimits(user);
  } catch (error) {
    console.error("Tier detection failed, using anonymous limits");
    return ANONYMOUS_RATE_LIMIT;
  }
};
```

### 3. Redis Fallback

The middleware is designed to fail gracefully:

```typescript
// If Redis is completely down:
// 1. Logs error
// 2. Allows request to proceed
// 3. No rate limiting (but app still works)
// 4. Monitor alerts should fire
```

## Getting Help

### 1. Check Logs First

```bash
# Local development
npm run dev
# Check browser console and terminal

# Production
vercel logs --follow
# Check for Redis errors
```

### 2. Test Components Separately

```bash
# Test Redis connection
node scripts/test-redis-connection.js

# Test specific endpoint
curl -v http://localhost:3000/api/chat/sessions
```

### 3. Verify Configuration

```bash
# Environment variables
printenv | grep UPSTASH

# Middleware imports
grep -r "withRedisRateLimit" src/

# Package installation
npm list @upstash/redis
```

### 4. Common Fix Commands

```bash
# Reinstall Redis package
npm install @upstash/redis@latest

# Clear build cache
rm -rf .next
npm run build

# Reset environment
cp .env.example .env.local
# Add your Redis credentials
```

This troubleshooting guide should help you resolve most Redis rate limiting issues quickly and efficiently!
