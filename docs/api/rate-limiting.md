# API Rate Limiting Documentation

This document describes the rate limiting behavior for all API endpoints in the OpenRouter Chatbot application.

## Overview

All API endpoints are protected by Redis-based rate limiting that scales with user subscription tiers. Rate limits are enforced using a sliding window algorithm for accurate and fair usage control.

## Rate Limit Tiers

### Anonymous Users (No Authentication)

- **Limit**: 20 requests per hour
- **Identification**: IP address
- **Headers**: Standard rate limit headers included

### Free Tier Users

- **Limit**: 100 requests per hour
- **Identification**: User ID
- **Headers**: Standard rate limit headers included

### Pro Tier Users

- **Limit**: 1,000 requests per hour
- **Identification**: User ID
- **Headers**: Standard rate limit headers included

### Enterprise Tier Users

- **Limit**: 5,000 requests per hour
- **Identification**: User ID
- **Headers**: Standard rate limit headers included

## HTTP Headers

All API responses include rate limiting information in the following headers:

```http
X-RateLimit-Limit: 100           # Your tier's hourly limit
X-RateLimit-Remaining: 95        # Requests remaining in current window
X-RateLimit-Reset: 3600          # Seconds until limit resets
X-RateLimit-Used: 5              # Requests used in current window
```

## Protected Endpoints

The following endpoints enforce rate limiting:

### Chat Endpoints

- `POST /api/chat` - Create new chat message
- `GET /api/chat/sessions` - List chat sessions
- `POST /api/chat/sessions` - Create new chat session
- `GET /api/chat/messages` - Retrieve chat messages
- `DELETE /api/chat/messages` - Delete chat messages

### Analytics Endpoints

- `POST /api/analytics/cta` - Track CTA interactions

### Upload Endpoints

- `POST /api/uploads/images` - Upload image attachments

### Generation Endpoints

- `GET /api/generation/[id]` - Check generation status

### Attachment Endpoints

- `GET /api/attachments/[id]` - Retrieve attachment
- `GET /api/attachments/[id]/signed-url` - Get signed URL for attachment

## Error Responses

### Rate Limit Exceeded (429)

When rate limit is exceeded, the API returns:

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 3600,
  "limit": 100,
  "remaining": 0,
  "resetTime": "2024-01-20T15:00:00.000Z"
}
```

**Response Headers**:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 3600
Retry-After: 3600
```

## Implementation Details

### Sliding Window Algorithm

Rate limiting uses a sliding window approach:

1. **Precision**: Tracks requests by exact timestamp
2. **Fairness**: No reset boundary issues
3. **Efficiency**: Old entries automatically expire
4. **Accuracy**: Atomic Redis operations prevent race conditions

### Redis Key Structure

```
rate_limit:user:{userId}    # Authenticated users
rate_limit:ip:{ipAddress}   # Anonymous users
```

### Performance

- **Latency**: ~5-30ms per request
- **Commands**: 4 Redis commands per rate limit check
- **Memory**: ~100 bytes per active user
- **Persistence**: Survives serverless function restarts

## Client Integration

### Handling Rate Limits

**Best Practices for API Consumers**:

1. **Check Headers**: Always read rate limit headers
2. **Implement Backoff**: Use exponential backoff on 429 responses
3. **Respect Limits**: Don't exceed your tier's limits
4. **Monitor Usage**: Track your request patterns

### Example Client Code

```javascript
// JavaScript example
async function makeAPIRequest(url, options = {}) {
  const response = await fetch(url, options);

  // Check rate limiting headers
  const limit = parseInt(response.headers.get("X-RateLimit-Limit"));
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"));
  const reset = parseInt(response.headers.get("X-RateLimit-Reset"));

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After"));
    console.log(`Rate limited. Retry after ${retryAfter} seconds`);

    // Implement retry logic
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return makeAPIRequest(url, options); // Retry
  }

  // Log usage for monitoring
  console.log(
    `Rate limit: ${remaining}/${limit} remaining, resets in ${reset}s`
  );

  return response;
}
```

### Python Example

```python
import time
import requests

def make_api_request(url, **kwargs):
    response = requests.request(**kwargs, url=url)

    # Check rate limiting
    limit = int(response.headers.get('X-RateLimit-Limit', 0))
    remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
    reset_seconds = int(response.headers.get('X-RateLimit-Reset', 0))

    if response.status_code == 429:
        retry_after = int(response.headers.get('Retry-After', reset_seconds))
        print(f"Rate limited. Waiting {retry_after} seconds...")
        time.sleep(retry_after)
        return make_api_request(url, **kwargs)  # Retry

    print(f"Rate limit: {remaining}/{limit} remaining")
    return response
```

## Monitoring and Debugging

### For Developers

**Check Rate Limit Status**:

```bash
# Make a test request and inspect headers
curl -I https://your-app.vercel.app/api/chat/sessions \
  -H "Authorization: Bearer your-token"
```

**Debug Rate Limiting**:

```bash
# Check server logs for rate limiting events
vercel logs | grep "rate limit"
```

### For API Consumers

**Monitor Your Usage**:

- Track the `X-RateLimit-Remaining` header
- Log when you approach limits
- Set up alerts for 429 responses

**Optimize Request Patterns**:

- Batch operations when possible
- Cache responses to reduce API calls
- Use webhooks instead of polling when available

## Upgrade Path

### Increasing Rate Limits

To increase your rate limits:

1. **Upgrade Subscription**: Move to Pro or Enterprise tier
2. **Contact Support**: For custom enterprise limits
3. **Optimize Usage**: Implement caching and batching

### Custom Limits

Enterprise customers can request custom rate limits based on:

- Use case requirements
- Traffic patterns
- Geographic distribution
- SLA requirements

## Security Considerations

### Abuse Prevention

Rate limiting protects against:

- **DoS Attacks**: Prevents overwhelming the API
- **Cost Attacks**: Limits expensive operations
- **Brute Force**: Slows down automated attacks
- **Resource Exhaustion**: Prevents database overload

### Fair Usage

- **Per-User Limits**: Prevents single user from impacting others
- **Sliding Window**: Ensures fair distribution over time
- **Tier-Based**: Scales with subscription level
- **Graceful Degradation**: Continues working if Redis is unavailable

## FAQ

**Q: What happens if I exceed my rate limit?**
A: You'll receive a 429 status code with retry information. Wait for the specified time before retrying.

**Q: Are rate limits shared across endpoints?**
A: Yes, all API endpoints share the same rate limit pool for your user/IP.

**Q: Can I check my current usage?**
A: Yes, every API response includes your current usage in the headers.

**Q: Do rate limits reset at a fixed time?**
A: No, we use a sliding window that moves continuously, not fixed time windows.

**Q: What if Redis is down?**
A: The API continues working but without rate limiting temporarily. This is logged for monitoring.

**Q: Can I get higher limits?**
A: Yes, upgrade to Pro or Enterprise tiers, or contact us for custom limits.

---

For implementation details, see `/docs/architecture/redis-rate-limiting.md`.

For setup instructions, see `/docs/ops/redis-rate-limiting-setup.md`.

For troubleshooting, see `/docs/ops/redis-rate-limiting-troubleshooting.md`.
