# Rate Limiting Strategy per API Endpoint

## Current State Analysis

### Issues Identified

1. **Enterprise Bypass Problem**: Enterprise tier completely bypasses rate limiting (`hasRateLimitBypa// src/app/api/chat/route.ts
   export const POST = withProtectedAuth(
   withTieredRateLimit(chatHandler, { tier: "A" })
   );

// src/app/api/models/route.ts  
export const GET = withEnhancedAuth(
withTieredRateLimit(modelsHandler, { tier: "C" })
);| `/api/generation/[id]` | GET | C | 100/hour | 200/hour | 1000/hour | 2000/hour | UNLIMITED | Enhanced | 🔍 Status check |
// src/app/api/uploads/images/route.ts
export const POST = withProtectedAuth(
withTieredRateLimit(uploadHandler, { tier: "B" })
);

// src/app/api/admin/users/route.ts - NO RATE LIMITING NEEDED
export const GET = withAdminAuth(usersHandler); // Already protected by account_type checkich could lead to API cost abuse 2. **Incomplete Coverage**: Many API endpoints lack rate limiting protection 3. **Single Rate Limit**: All endpoints share the same rate limit pool, which isn't appropriate for different types of operations 4. **No Distinction**: High-cost operations (chat, image uploads) are treated the same as low-cost operations (fetching models, sessions)

### Current Rate Limits (All Tiers, All Endpoints Combined)

- **Anonymous**: 20 requests/hour, 5000 tokens/request
- **Free**: 100 requests/hour, 10000 tokens/request
- **Pro**: 500 requests/hour, 20000 tokens/request
- **Enterprise**: **UNLIMITED** (bypassed completely) ⚠️

### Updated Chat-Specific Rate Limits (Locked In)

- **Anonymous**: 10 requests/hour, 5000 tokens/request
- **Free**: 20 requests/hour, 10000 tokens/request
- **Pro**: 200 requests/hour, 20000 tokens/request
- **Enterprise+User**: 500 requests/hour, 50000 tokens/request
- **Enterprise+Admin**: **UNLIMITED** (bypassed completely) ⚠️

---

## Proposed Solution: Multi-Tier Rate Limiting Strategy

### 1. Endpoint Classification

#### **Tier A: High-Cost Operations** (Primary API Cost Driver)

- `/api/chat` - LLM inference, highest cost impact
  - **Rate limits locked in**:
    - Anonymous: 10/hour, 5000 tokens/request
    - Free: 20/hour, 10000 tokens/request
    - Pro: 200/hour, 20000 tokens/request
    - Enterprise+User: 500/hour, 50000 tokens/request
    - Enterprise+Admin: UNLIMITED

#### **Tier B: Medium-Cost Operations** ✅ **PRE-GATED BY SUBSCRIPTION**

- `/api/uploads/images` - Storage and processing costs
  - **Already protected**: Uses `withTierAuth('pro')` - Anonymous/Free users get 403 BEFORE rate limiting
  - **Note**: Rate limiting will be secondary protection for Pro+ users only

#### **Tier B: Medium-Cost Operations**

- `/api/attachments/[id]/signed-url` - Storage bandwidth
- `/api/user/data` - Database operations with potential for large payloads

#### **Tier C: Low-Cost Operations**

- `/api/models` - Cached data, minimal cost
- `/api/analytics/cta` - Landing page button click tracking (anonymous users)
- `/api/chat/sessions` - Session CRUD operations (GET/POST/DELETE) ✅ **CONFIRMED IN USE**
- `/api/chat/session` - Session title updates ✅ **CONFIRMED IN USE**
- `/api/chat/messages` - Message history
- `/api/generation/[id]` - Status checks

#### **Tier D: Administrative/Internal** - **ALREADY PROTECTED** ✅

- `/api/admin/*` - Admin operations protected by `withAdminAuth` middleware
- `/api/cron/*` - Background jobs (no limits needed)
- `/api/health/*` - System monitoring (no limits needed)

**Note**: Admin endpoints do not require rate limiting as they are already restricted to users with `account_type = 'admin'`.

### 2. Subscription-Based Rate Limits

#### **Anonymous Users**

```typescript
const ANONYMOUS_LIMITS = {
  tierA: { requests: 10, window: 3600000 }, // 10/hour for chat (locked in)
  tierB: { requests: 5, window: 3600000 }, // 5/hour for medium operations
  tierC: { requests: 50, window: 3600000 }, // 50/hour for metadata
  tierD: { requests: 0, window: 3600000 }, // No admin access
};
```

#### **Free Tier**

```typescript
const FREE_LIMITS = {
  tierA: { requests: 20, window: 3600000 }, // 20/hour for chat (locked in)
  tierB: { requests: 10, window: 3600000 }, // 10/hour for medium operations
  tierC: { requests: 100, window: 3600000 }, // 100/hour for metadata
  tierD: { requests: 0, window: 3600000 }, // No admin access
};
```

#### **Pro Tier**

```typescript
const PRO_LIMITS = {
  tierA: { requests: 200, window: 3600000 }, // 200/hour for chat (locked in)
  tierB: { requests: 50, window: 3600000 }, // 50/hour for medium operations
  tierC: { requests: 500, window: 3600000 }, // 500/hour for metadata
  tierD: { requests: 0, window: 3600000 }, // No admin access
};
```

#### **Enterprise Tier** - **Admin vs User Differentiation**

```typescript
const ENTERPRISE_USER_LIMITS = {
  tierA: { requests: 500, window: 3600000 }, // 500/hour for chat (locked in)
  tierB: { requests: 200, window: 3600000 }, // 200/hour for medium operations
  tierC: { requests: 2000, window: 3600000 }, // 2000/hour for metadata
  tierD: { requests: 0, window: 3600000 }, // No admin access for regular enterprise users
};

const ENTERPRISE_ADMIN_LIMITS = {
  tierA: { requests: Infinity, window: 3600000 }, // BYPASS for chat (admin override)
  tierB: { requests: Infinity, window: 3600000 }, // BYPASS for medium operations (admin override)
  tierC: { requests: Infinity, window: 3600000 }, // BYPASS for metadata (admin override)
  tierD: { requests: Infinity, window: 3600000 }, // BYPASS for admin operations
};
```

**Note**: Admin endpoints (`/api/admin/*`) are already protected by `withAdminAuth` middleware and do not need additional rate limiting.

### 3. Token-Based Limits (Chat Endpoint Only)

Keep existing token limits for `/api/chat` endpoint:

- **Anonymous**: 5,000 tokens/request
- **Free**: 10,000 tokens/request
- **Pro**: 20,000 tokens/request
- **Enterprise+User**: 50,000 tokens/request
- **Enterprise+Admin**: 50,000 tokens/request (no change, already high)

### 4. Implementation Strategy

#### Phase 1: Core Infrastructure ✅

- [x] Redis-based rate limiting middleware
- [x] Tier-based rate limit determination
- [x] Proper error handling and fallbacks

#### Phase 2: Endpoint Classification & Rate Limit Assignment

- [ ] **Update Redis key generation** to include tier prefix (e.g., `tierA`, `tierB`, `tierC`)
- [ ] Create `generateTieredRateLimitKey()` function
- [ ] Create `withTieredRateLimit()` middleware wrapper
- [ ] Update rate limit calculator to use tiered limits
- [ ] Apply to all API routes with appropriate tiers

#### Phase 3: Enterprise Admin Bypass Implementation ✅

- [ ] Update `hasRateLimitBypass` logic to require both `subscription_tier='enterprise'` AND `account_type='admin'`
- [ ] Remove blanket enterprise bypass for regular enterprise users
- [ ] Update `TierBadge` component to differentiate enterprise users vs enterprise admins
- [ ] Test admin override functionality

#### Phase 4: Advanced Features

- [ ] Rate limit monitoring dashboard
- [ ] Dynamic rate limit adjustment
- [ ] Burst capacity for short-term spikes

### 5. Technical Implementation

#### A. Redis Key Structure Changes ⚠️ **BREAKING CHANGE**

**Current Redis Keys (Single Pool):**

```
rate_limit:user:123           # All endpoints share same counter
rate_limit:ip:192.168.1.1     # All endpoints share same counter
```

**New Redis Keys (Tiered Pools):**

```
rate_limit:tierA:user:123     # Chat endpoint only
rate_limit:tierB:user:123     # Medium-cost operations only
rate_limit:tierC:user:123     # Low-cost operations only
rate_limit:tierA:ip:192.168.1.1  # Anonymous chat
rate_limit:tierB:ip:192.168.1.1  # Anonymous medium ops
rate_limit:tierC:ip:192.168.1.1  # Anonymous low ops
```

#### B. Updated Key Generation Function

```typescript
// lib/middleware/redisRateLimitMiddleware.ts

/**
 * Generate tiered rate limit key based on endpoint tier
 */
function generateTieredRateLimitKey(
  request: NextRequest,
  authContext: AuthContext,
  tier: string
): string {
  // Use user ID if authenticated, otherwise fall back to IP
  if (authContext.user?.id) {
    return `rate_limit:${tier}:user:${authContext.user.id}`;
  }

  // Get IP address with fallback
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  return `rate_limit:${tier}:ip:${ip}`;
}
```

#### C. Middleware Configuration Update

#### C. Middleware Configuration Update

```typescript
// lib/middleware/redisRateLimitMiddleware.ts
export interface EndpointRateLimitConfig {
  tier: "tierA" | "tierB" | "tierC" | "tierD"; // Match Redis key format
  customWindowMs?: number;
  burstCapacity?: number;
}

export function withTieredRateLimit<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  config: EndpointRateLimitConfig
) {
  return withRedisRateLimit(handler, {
    customLimit: calculateTieredLimit(config.tier, context),
    windowMs: config.customWindowMs,
    keyGenerator: (req, ctx) =>
      generateTieredRateLimitKey(req, ctx, config.tier),
  });
}
```

#### D. Rate Limit Calculator

```typescript
// lib/utils/rateLimitCalculator.ts
export function calculateTieredLimit(
  tier: "tierA" | "tierB" | "tierC" | "tierD",
  subscriptionTier: UserProfile["subscription_tier"],
  accountType?: UserProfile["account_type"]
): number {
  const limits = {
    anonymous: { tierA: 10, tierB: 5, tierC: 100, tierD: 0 }, // Chat locked to 10/hour, CTA tracking needs 100/hour
    free: { tierA: 20, tierB: 10, tierC: 200, tierD: 0 }, // Chat locked to 20/hour, CTA tracking needs 200/hour
    pro: { tierA: 200, tierB: 50, tierC: 1000, tierD: 0 }, // Chat locked to 200/hour, CTA tracking needs 1000/hour
    enterprise: { tierA: 500, tierB: 200, tierC: 2000, tierD: 0 }, // Regular enterprise users - Chat locked to 500/hour
  };

  // Enterprise admin bypass
  if (subscriptionTier === "enterprise" && accountType === "admin") {
    return Infinity; // No rate limits for enterprise admins
  }

  return limits[subscriptionTier || "free"][tier];
}
```

#### E. Route Updates Example

```typescript
// src/app/api/chat/route.ts
export const POST = withProtectedAuth(
  withTieredRateLimit(chatHandler, { tier: "tierA" })
);

// src/app/api/models/route.ts
export const GET = withEnhancedAuth(
  withTieredRateLimit(modelsHandler, { tier: "tierC" })
);

// src/app/api/uploads/images/route.ts
export const POST = withProtectedAuth(
  withTieredRateLimit(uploadHandler, { tier: "tierB" })
);

// src/app/api/admin/users/route.ts - NO RATE LIMITING NEEDED
export const GET = withAdminAuth(usersHandler); // Already protected by account_type check
```

### 6. Monitoring & Observability

#### Rate Limit Metrics to Track:

- Requests per endpoint per tier
- Rate limit violations by subscription tier
- API cost correlation with rate limit usage
- Enterprise usage patterns (post-bypass removal)

#### Alerting Triggers:

- Enterprise users hitting rate limits (indicates possible adjustment needed)
- Unusual spike in Tier A operations
- High rate limit violation rates

### 7. Migration Strategy

#### Week 1: Infrastructure

1. Implement tiered rate limiting middleware
2. Add rate limit calculation utilities
3. Create monitoring dashboard

#### Week 2: Gradual Rollout

1. Apply tiered limits to non-critical endpoints (Tier C)
2. Monitor impact and adjust if needed
3. Apply to medium-cost endpoints (Tier B)

#### Week 3: Critical Operations & Enterprise Admin Implementation

1. Apply to high-cost endpoints (Tier A)
2. **Implement enterprise admin bypass** (subscription_tier='enterprise' AND account_type='admin')
3. Monitor enterprise user usage patterns (regular users now have finite limits)
4. Update TierBadge component to show different messages for enterprise users vs admins

#### Week 4: Optimization

1. Fine-tune limits based on real usage data
2. Implement burst capacity features
3. Add dynamic adjustment capabilities

### 8. Redis Migration Considerations ⚠️

#### Data Migration Impact

**Current Redis Keys (Will Be Abandoned):**

```
rate_limit:user:123
rate_limit:ip:192.168.1.1
```

**New Redis Keys (After Migration):**

```
rate_limit:tierA:user:123
rate_limit:tierB:user:123
rate_limit:tierC:user:123
```

#### Migration Strategy Options

1. **Hard Cutover (Recommended)**:

   - Deploy new key structure immediately
   - Old keys will naturally expire (1 hour TTL)
   - Users get "fresh" rate limits for each tier
   - **Pro**: Simple, clean separation
   - **Con**: Users might get temporarily higher limits during transition

2. **Gradual Migration**:
   - Read from old keys, write to new keys
   - More complex but preserves existing rate limit state
   - **Pro**: No temporary limit reset
   - **Con**: More complex implementation

#### Redis Memory Impact

- **Before**: 1 key per user/IP
- **After**: Up to 3 keys per user/IP (tierA, tierB, tierC)
- **Estimated increase**: ~200-300% Redis memory usage
- **Mitigation**: TTL ensures old keys expire automatically

### 9. Security Considerations

### 9. Security Considerations

#### DoS Protection:

#### DoS Protection:

- IP-based rate limiting for anonymous users
- Progressive backoff for repeated violations
- Automated temporary account suspension for severe abuse

#### Cost Protection:

- Token limits on chat endpoint prevent prompt injection attacks
- Upload size limits prevent storage abuse
- Admin endpoint restrictions prevent unauthorized access

### 10. User Communication

#### For Enterprise Users:

> "#### For Enterprise Users:
> "We're enhancing our rate limiting system with more granular controls. Enterprise accounts now have generous finite limits (1500 chat requests/hour), with complete bypass reserved for enterprise admin accounts only. If you have legitimate needs that exceed these limits, please contact support about admin access."

#### For Enterprise Admins:

> "Enterprise admin accounts maintain unlimited API access for administrative purposes. Regular enterprise users now have generous but finite limits to ensure optimal system performance.""

#### For All Users:

> "We've enhanced our rate limiting system to provide better performance and more granular controls. Different types of operations now have appropriate limits that better match their system impact."

---

## Complete API Endpoints Rate Limiting Table

### 📊 **All API Endpoints Rate Limits by Account Type**

| Endpoint                                   | Method | Tier  | Anonymous   | Free        | Pro          | Enterprise+User | Enterprise+Admin | Auth Type | Notes                              |
| ------------------------------------------ | ------ | ----- | ----------- | ----------- | ------------ | --------------- | ---------------- | --------- | ---------------------------------- |
| **TIER A - HIGH COST (LLM Inference)**     |        |       |             |             |              |                 |                  |           |
| `/api/chat`                                | POST   | **A** | **10/hour** | **20/hour** | **200/hour** | **500/hour**    | **UNLIMITED**    | Enhanced  | ⚡ Primary cost driver - LLM calls |
| **TIER B - MEDIUM COST**                   |        |       |             |             |              |                 |                  |           |
| `/api/uploads/images`                      | POST   | B     | ❌          | ❌          | 50/hour      | 200/hour        | UNLIMITED        | Tier(Pro) | 📸 Already gated by subscription   |
| `/api/attachments/[id]/signed-url`         | GET    | B     | ❌          | 10/hour     | 50/hour      | 200/hour        | UNLIMITED        | Protected | 🔗 Storage bandwidth               |
| `/api/user/data`                           | GET    | B     | ❌          | 10/hour     | 50/hour      | 200/hour        | UNLIMITED        | Protected | 👤 Large database queries          |
| `/api/user/data`                           | PUT    | B     | ❌          | 10/hour     | 50/hour      | 200/hour        | UNLIMITED        | Protected | 👤 Profile updates                 |
| `/api/attachments/[id]`                    | DELETE | B     | ❌          | 10/hour     | 50/hour      | 200/hour        | UNLIMITED        | Protected | �️ File deletion                   |
| **TIER C - LOW COST (CRUD Operations)**    |        |       |             |             |              |                 |                  |           |
| `/api/analytics/cta`                       | POST   | C     | 100/hour    | 200/hour    | 1000/hour    | 2000/hour       | UNLIMITED        | Enhanced  | 📊 Landing page button clicks      |
| `/api/models`                              | GET    | C     | 100/hour    | 200/hour    | 1000/hour    | 2000/hour       | UNLIMITED        | Enhanced  | 📋 Cached model list               |
| `/api/chat/sessions`                       | GET    | C     | ❌          | 200/hour    | 1000/hour    | 2000/hour       | UNLIMITED        | Protected | 📋 List sessions                   |
| `/api/chat/sessions`                       | POST   | C     | ❌          | 200/hour    | 1000/hour    | 2000/hour       | UNLIMITED        | Protected | ➕ Create session                  |
| `/api/chat/sessions`                       | DELETE | C     | ❌          | 200/hour    | 1000/hour    | 2000/hour       | UNLIMITED        | Protected | 🗑️ Delete session                  |
| `/api/chat/session`                        | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 📖 Session details                 |
| `/api/chat/session`                        | POST   | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | ✏️ Update title                    |
| `/api/chat/messages`                       | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 💬 Message history                 |
| `/api/chat/messages`                       | POST   | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | � Save message                     |
| `/api/chat/sync`                           | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Ownership | 🔄 Sync status                     |
| `/api/chat/sync`                           | POST   | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Ownership | 📤 Sync conversations              |
| `/api/chat/clear-all`                      | DELETE | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 🧹 Clear all                       |
| `/api/generation/[id]`                     | GET    | C     | 50/hour     | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Enhanced  | � Status check                     |
| `/api/usage/costs`                         | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 💰 Usage stats                     |
| `/api/usage/costs/daily`                   | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 📊 Daily costs                     |
| `/api/usage/costs/models/daily`            | GET    | C     | ❌          | 100/hour    | 500/hour     | 2000/hour       | UNLIMITED        | Protected | 📈 Model costs                     |
| **TIER D - ADMIN ONLY (No Rate Limiting)** |        |       |             |             |              |                 |                  |           |
| `/api/admin/users`                         | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | � Admin protected                  |
| `/api/admin/users`                         | PATCH  | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | ✏️ Admin protected                 |
| `/api/admin/model-access`                  | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🔧 Admin protected                 |
| `/api/admin/model-access`                  | PATCH  | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🔧 Admin protected                 |
| `/api/admin/sync-models`                   | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🔄 Admin protected                 |
| `/api/admin/sync-models`                   | POST   | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🔄 Admin protected                 |
| `/api/admin/attachments/stats`             | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 📊 Admin protected                 |
| `/api/admin/attachments/cleanup`           | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🧹 Admin protected                 |
| `/api/admin/attachments/cleanup`           | POST   | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🧹 Admin protected                 |
| `/api/admin/attachments/retention`         | GET    | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | 🗂️ Admin protected                 |
| `/api/admin/attachments/retention`         | POST   | D     | ❌          | ❌          | ❌           | ❌              | ✅ No Limit      | Admin     | �️ Admin protected                 |
| **INTERNAL/CRON (No Rate Limiting)**       |        |       |             |             |              |                 |                  |           |
| `/api/internal/sync-models`                | POST   | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Internal  | 🤖 HMAC/Token auth                 |
| `/api/internal/attachments/cleanup`        | POST   | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Internal  | 🤖 HMAC/Token auth                 |
| `/api/internal/attachments/retention`      | POST   | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Internal  | 🤖 HMAC/Token auth                 |
| `/api/cron/models/sync`                    | \*     | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Cron      | 🤖 Scheduled job                   |
| `/api/cron/attachments/cleanup`            | \*     | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Cron      | 🤖 Scheduled job                   |
| `/api/cron/attachments/retention`          | \*     | N/A   | ❌          | ❌          | ❌           | ❌              | ❌               | Cron      | � Scheduled job                    |
| `/api/health/cache`                        | GET    | N/A   | ✅ No Limit | ✅ No Limit | ✅ No Limit  | ✅ No Limit     | ✅ No Limit      | Public    | 🔍 System monitoring               |

### 🎯 **Key Insights**

#### **TierBadge Focus** 🏷️

- **Display**: Only `/api/chat` POST rate limits (10/20/200/500/UNLIMITED)
- **Reason**: This is the primary cost driver that users need to understand

#### **Access Patterns**

- **❌ No Access**: Endpoint requires higher tier or admin privileges
- **Enhanced Auth**: Anonymous + authenticated users (like `/api/chat`, `/api/models`)
- **Protected Auth**: Authenticated users only
- **Tier Auth**: Specific subscription tier required (like `/api/uploads/images` needs Pro+)
- **Admin Auth**: Enterprise admin accounts only
- **Internal**: HMAC/token authentication for system jobs

#### **Rate Limit Philosophy**

- **Tier A**: Strict control on expensive LLM calls
- **Tier B**: Moderate limits on medium-cost operations
- **Tier C**: Generous limits on cheap CRUD operations
- **Tier D**: No limits needed (already admin-protected)

### 🔧 **Token Limits (Chat Endpoint Only)**

| Account Type     | Max Tokens/Request |
| ---------------- | ------------------ |
| Anonymous        | 5,000 tokens       |
| Free             | 10,000 tokens      |
| Pro              | 20,000 tokens      |
| Enterprise+User  | 50,000 tokens      |
| Enterprise+Admin | 50,000 tokens      |

---

## Summary of Redis Key Changes Required

### 🔧 **Core Redis Changes**

1. **Key Structure Change**:

   - **Old**: `rate_limit:user:123` (single pool)
   - **New**: `rate_limit:tierA:user:123`, `rate_limit:tierB:user:123`, `rate_limit:tierC:user:123`

2. **New Functions Needed**:

   - `generateTieredRateLimitKey(request, authContext, tier)`
   - `withTieredRateLimit(handler, { tier: "tierA" })`
   - `calculateTieredLimit(tier, subscriptionTier, accountType)`

3. **Memory Impact**:

   - Redis usage will increase ~200-300% (3 keys instead of 1)
   - Old keys will expire naturally (1 hour TTL)

4. **Migration**:
   - Hard cutover recommended (deploy and go)
   - Users get fresh rate limits per tier
   - No data migration script needed

### 🎯 **Implementation Priority**

1. **Phase 1**: Update key generation functions
2. **Phase 2**: Create `withTieredRateLimit()` wrapper
3. **Phase 3**: Apply to `/api/chat` endpoint first (highest impact)
4. **Phase 4**: Roll out to other endpoints

---

## Summary of Key Changes

1. **✅ Implement Enterprise Admin Bypass**: Only `subscription_tier='enterprise'` AND `account_type='admin'` bypass limits
2. **✅ Endpoint Classification**: Different limits for different operation types
3. **✅ Selective Coverage**: Apply rate limiting to public API endpoints (admin endpoints already protected)
4. **✅ Tier-Appropriate Limits**: Scale limits based on subscription value
5. **✅ Cost Protection**: Prioritize limiting high-cost operations
6. **✅ TierBadge Updates**: Differentiate enterprise users vs enterprise admins
7. **✅ Gradual Migration**: Phase rollout to minimize disruptionThis strategy addresses the core issues while providing a scalable foundation for future growth and cost management.
