# Redis Rate Limiting Setup Guide

This guide covers setting up Redis-based rate limiting for the OpenRouter Chatbot in development and production environments.

## Overview

The OpenRouter Chatbot uses Redis-based rate limiting to protect against abuse while remaining serverless-compatible. This replaces the previous in-memory solution that was broken on serverless deployments.

## Development Setup

### 1. Create Upstash Account

1. Go to [Upstash Console](https://console.upstash.com/)
2. Sign up for a free account
3. Click "Create Database"
4. Select:
   - **Name**: `openrouter-chatbot-dev`
   - **Type**: `Regional` (cheaper for dev)
   - **Region**: Choose closest to your location
   - **Plan**: `Free` (10,000 commands/day)

### 2. Get Connection Details

1. In your Upstash dashboard, click on your database
2. Go to "REST API" tab
3. Copy the following values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 3. Update Environment Variables

Create or update `.env.local`:

```env
# Redis Rate Limiting (Development)
UPSTASH_REDIS_REST_URL=https://your-database-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

### 4. Test Connection

Run the connection test script:

```bash
node scripts/test-redis-connection.js
```

Expected output:

```
Testing Redis connection...
✅ Redis connection successful!
Set test key: OK
Retrieved test key: test-value
✅ All Redis operations working correctly!
```

### 5. Verify Rate Limiting

Start your development server:

```bash
npm run dev
```

Test rate limiting by making multiple API requests. You should see rate limiting headers in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 3600
```

## Production Setup

### 1. Create Production Database

1. In Upstash Console, create a new database:
   - **Name**: `openrouter-chatbot-prod`
   - **Type**: `Regional` or `Global` (based on your users)
   - **Region**: Same as your Vercel deployment region
   - **Plan**: `Pay as You Go` (scales automatically)

### 2. Configure Vercel Environment Variables

In your Vercel project settings:

1. Go to **Settings** → **Environment Variables**
2. Add the following variables:

```env
UPSTASH_REDIS_REST_URL=https://your-prod-database-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-prod-token-here
```

Set for all environments: **Production**, **Preview**, **Development**

### 3. Deploy and Test

Deploy your application:

```bash
vercel --prod
```

Test rate limiting on production:

```bash
# Test with curl
curl -I https://your-app.vercel.app/api/chat/sessions
```

Look for rate limiting headers in the response.

## Configuration Details

### Rate Limits by User Tier

```typescript
const RATE_LIMITS = {
  anonymous: 20, // requests per hour
  free: 100, // requests per hour
  pro: 1000, // requests per hour
  enterprise: 5000, // requests per hour
};
```

### Redis Key Structure

Rate limiting uses the following Redis key patterns:

```
rate_limit:user:{userId}        # Authenticated users
rate_limit:ip:{ipAddress}       # Anonymous users
```

### Sliding Window Implementation

- Uses Redis sorted sets for precise sliding window
- Stores timestamps as scores
- Automatically expires old entries
- 4 Redis commands per rate limit check:
  1. `ZREMRANGEBYSCORE` - Remove old entries
  2. `ZADD` - Add current request
  3. `ZCARD` - Count current requests
  4. `EXPIRE` - Set key expiration

## Monitoring and Costs

### Upstash Dashboard

Monitor usage in your Upstash dashboard:

- **Commands/day**: Track Redis command usage
- **Memory usage**: Monitor data storage
- **Response times**: Check performance

### Cost Monitoring

**Free Tier**: 10,000 commands/day
**Pay-as-you-go**: $0.2 per 100,000 commands

**Cost Examples**:

- 1,000 API requests/day = 4,000 Redis commands = **FREE**
- 10,000 API requests/day = 40,000 Redis commands = **$0.08/day**
- 100,000 API requests/day = 400,000 Redis commands = **$0.80/day**

### Performance Metrics

Expected Redis response times:

- **Regional**: 5-20ms latency
- **Global**: 20-50ms latency
- **Commands per request**: ~4 commands
- **Memory per user**: ~100 bytes per active user

## Troubleshooting

### Connection Issues

**Error**: `Redis connection failed`

1. Verify environment variables are set correctly
2. Check Upstash database is active
3. Confirm REST API is enabled
4. Test with connection script: `node scripts/test-redis-connection.js`

### High Command Usage

**Warning**: Approaching 10,000 commands/day on free tier

1. Check for request loops or automated testing
2. Monitor rate limiting effectiveness
3. Consider upgrading to pay-as-you-go
4. Review API usage patterns

### Rate Limiting Not Working

**Issue**: Requests not being rate limited

1. Check Redis connection in Vercel logs
2. Verify environment variables in production
3. Confirm middleware is applied to routes
4. Test with curl to see rate limiting headers

### Performance Issues

**Issue**: Slow API responses

1. Check Redis response times in Upstash dashboard
2. Consider upgrading to Global database for worldwide users
3. Monitor Vercel function execution times
4. Check for Redis timeout errors in logs

## Migration from In-Memory Rate Limiting

If migrating from the old in-memory rate limiting:

1. **Update imports**: Change from `withRateLimit` to `withRedisRateLimit`
2. **Environment setup**: Add Redis environment variables
3. **Test thoroughly**: Verify rate limiting works in staging
4. **Monitor costs**: Track Redis usage after deployment

### Example Migration

**Before**:

```typescript
import { withRateLimit } from "../../../lib/middleware/rateLimitMiddleware";
export const POST = withRateLimit(handler);
```

**After**:

```typescript
import { withRedisRateLimit } from "../../../lib/middleware/redisRateLimitMiddleware";
export const POST = withRedisRateLimit(handler);
```

## Security Considerations

- **Environment Variables**: Never commit Redis credentials to git
- **Network Security**: Upstash uses TLS encryption
- **Access Control**: Redis tokens provide database-level access
- **Rate Limiting**: Protects against abuse and cost overruns
- **Monitoring**: Set up alerts for unusual usage patterns

## Next Steps

1. **Set up monitoring alerts** in Upstash dashboard
2. **Configure backup strategies** for critical rate limiting data
3. **Review rate limits** based on actual usage patterns
4. **Consider regional deployment** for better performance

---

For technical implementation details, see `/docs/architecture/redis-rate-limiting.md`.

For troubleshooting common issues, see `/docs/ops/redis-rate-limiting-troubleshooting.md`.
