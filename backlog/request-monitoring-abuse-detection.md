# Implement Comprehensive Request Monitoring & Abuse Detection

## Priority: 🚨 CRITICAL - Security & Cost Protection

## Overview

**Current Issue**: With broken rate limiting removed, the application has zero protection against abuse and no visibility into request patterns. This creates unlimited cost exposure and security vulnerabilities.

**Security Risk**: Malicious actors can perform DoS attacks, data scraping, or abuse expensive AI endpoints without detection.

**Cost Risk**: Without monitoring, unusual usage patterns could generate thousands in unexpected costs before being noticed.

**Business Risk**: No insights into actual usage patterns makes capacity planning and optimization impossible.

## Technical Analysis

### Current Blind Spots

```typescript
// What we don't know:
- Which endpoints are being abused
- Who is making excessive requests
- When unusual patterns occur
- What the actual usage costs are
- Whether attacks are happening right now
```

### Required Monitoring Capabilities

1. **Real-time Request Tracking**: Every API call logged with context
2. **Abuse Pattern Detection**: Automated alerts for suspicious behavior
3. **Cost Attribution**: Link requests to actual costs per user/endpoint
4. **Geographic Analysis**: Identify request origins for security
5. **Performance Monitoring**: Track response times and errors
6. **Business Intelligence**: Usage patterns for product decisions

## Solution Architecture

### Phase 1: Basic Request Logging (Week 1)

#### Request Log Schema

```sql
-- Create comprehensive request logging table
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Request identification
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,

  -- User context
  user_id UUID REFERENCES profiles(id),
  user_tier TEXT,
  is_authenticated BOOLEAN DEFAULT FALSE,

  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  referer TEXT,
  country_code TEXT,

  -- Timing and performance
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  response_time_ms INTEGER,
  status_code INTEGER,

  -- Cost and usage tracking
  function_duration_ms INTEGER,
  memory_used_mb INTEGER,
  estimated_cost_usd DECIMAL(10, 6),

  -- Request details
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,

  -- Business context
  model_used TEXT,
  tokens_consumed INTEGER,
  feature_flags JSONB,

  -- Indexes for efficient querying
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_request_logs_timestamp ON request_logs(timestamp DESC);
CREATE INDEX idx_request_logs_user_id ON request_logs(user_id, timestamp DESC);
CREATE INDEX idx_request_logs_endpoint ON request_logs(endpoint, timestamp DESC);
CREATE INDEX idx_request_logs_ip ON request_logs(ip_address, timestamp DESC);
CREATE INDEX idx_request_logs_cost ON request_logs(estimated_cost_usd DESC, timestamp DESC);
```

#### Request Logging Middleware

```typescript
// lib/middleware/requestLogger.ts
import { NextRequest, NextResponse } from "next/server";
import { AuthContext } from "../types/auth";
import { createClient } from "../supabase/server";
import { getClientIP, getCountryFromIP } from "../utils/network";

interface RequestLogEntry {
  request_id: string;
  endpoint: string;
  method: string;
  user_id?: string;
  user_tier?: string;
  is_authenticated: boolean;
  ip_address: string;
  user_agent?: string;
  referer?: string;
  country_code?: string;
  timestamp: string;
  response_time_ms?: number;
  status_code?: number;
  function_duration_ms?: number;
  memory_used_mb?: number;
  estimated_cost_usd?: number;
  request_size_bytes?: number;
  response_size_bytes?: number;
  model_used?: string;
  tokens_consumed?: number;
  feature_flags?: any;
}

export function withRequestLogging<T extends NextRequest>(
  handler: (req: T, authContext: AuthContext) => Promise<NextResponse>,
  options: {
    logLevel?: "basic" | "detailed" | "full";
    estimateCost?: boolean;
    trackTokens?: boolean;
  } = {}
) {
  return async (req: T, authContext: AuthContext): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const supabase = await createClient();

    // Extract request metadata
    const ip = getClientIP(req);
    const userAgent = req.headers.get("user-agent") || undefined;
    const referer = req.headers.get("referer") || undefined;
    const country = await getCountryFromIP(ip);

    // Get request size
    const requestBody = await req.clone().text();
    const requestSize = new TextEncoder().encode(requestBody).length;

    let response: NextResponse;
    let error: any = null;

    try {
      // Execute the actual handler
      response = await handler(req, authContext);
    } catch (err) {
      error = err;
      response = NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Get response size
    const responseText = await response.clone().text();
    const responseSize = new TextEncoder().encode(responseText).length;

    // Estimate cost based on execution time and memory
    const estimatedCost = options.estimateCost
      ? calculateFunctionCost(responseTime, 2048) // Assume 2GB default
      : undefined;

    // Create log entry
    const logEntry: RequestLogEntry = {
      request_id: requestId,
      endpoint: new URL(req.url).pathname,
      method: req.method,
      user_id: authContext.user?.id,
      user_tier: authContext.profile?.subscription_tier,
      is_authenticated: authContext.isAuthenticated,
      ip_address: ip,
      user_agent: userAgent,
      referer: referer,
      country_code: country,
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      status_code: response.status,
      function_duration_ms: responseTime,
      memory_used_mb: 2048, // Will be dynamic when we add memory tracking
      estimated_cost_usd: estimatedCost,
      request_size_bytes: requestSize,
      response_size_bytes: responseSize,
    };

    // Add specific tracking for AI endpoints
    if (req.url.includes("/api/chat")) {
      const requestData = requestBody ? JSON.parse(requestBody) : {};
      logEntry.model_used = requestData.model;
      logEntry.feature_flags = {
        reasoning: !!requestData.reasoning,
        webSearch: !!requestData.webSearch,
        attachments: !!requestData.attachmentIds?.length,
      };
    }

    // Log to database (don't await to avoid slowing response)
    supabase.from("request_logs").insert(logEntry).catch(console.error);

    // Add headers for debugging
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("X-Response-Time", responseTime.toString());

    // Log to console for immediate visibility
    console.log(
      `${req.method} ${logEntry.endpoint} - ${
        response.status
      } - ${responseTime}ms - ${authContext.user?.id || ip}`
    );

    if (error) {
      console.error("Request error:", error);
    }

    return response;
  };
}

function calculateFunctionCost(durationMs: number, memoryMb: number): number {
  const durationHours = durationMs / (1000 * 60 * 60);
  const memoryGb = memoryMb / 1024;
  const gbHours = memoryGb * durationHours;
  return gbHours * 0.18; // $0.18 per GB-Hour
}
```

### Phase 2: Abuse Detection System (Week 2)

#### Real-Time Abuse Detection

```typescript
// lib/services/abuseDetection.ts
interface AbusePattern {
  id: string;
  name: string;
  description: string;
  condition: (logs: RequestLogEntry[]) => boolean;
  severity: "low" | "medium" | "high" | "critical";
  action: "log" | "alert" | "block" | "escalate";
}

const ABUSE_PATTERNS: AbusePattern[] = [
  {
    id: "high_request_rate",
    name: "High Request Rate",
    description: "More than 100 requests per minute from single IP",
    condition: (logs) => {
      const lastMinute = Date.now() - 60 * 1000;
      const recentLogs = logs.filter(
        (log) => new Date(log.timestamp).getTime() > lastMinute
      );
      return recentLogs.length > 100;
    },
    severity: "high",
    action: "block",
  },

  {
    id: "expensive_endpoint_spam",
    name: "Expensive Endpoint Spam",
    description: "More than 10 chat requests per minute from single user",
    condition: (logs) => {
      const lastMinute = Date.now() - 60 * 1000;
      const chatLogs = logs.filter(
        (log) =>
          log.endpoint === "/api/chat" &&
          new Date(log.timestamp).getTime() > lastMinute
      );
      return chatLogs.length > 10;
    },
    severity: "critical",
    action: "escalate",
  },

  {
    id: "geographic_anomaly",
    name: "Geographic Anomaly",
    description: "Requests from high-risk countries",
    condition: (logs) => {
      const highRiskCountries = ["CN", "RU", "KP", "IR"];
      return logs.some((log) =>
        highRiskCountries.includes(log.country_code || "")
      );
    },
    severity: "medium",
    action: "alert",
  },

  {
    id: "cost_spike",
    name: "Cost Spike",
    description: "Single IP generating >$1 in costs per hour",
    condition: (logs) => {
      const lastHour = Date.now() - 60 * 60 * 1000;
      const recentCosts = logs
        .filter((log) => new Date(log.timestamp).getTime() > lastHour)
        .reduce((sum, log) => sum + (log.estimated_cost_usd || 0), 0);
      return recentCosts > 1.0;
    },
    severity: "critical",
    action: "escalate",
  },

  {
    id: "bot_behavior",
    name: "Bot Behavior",
    description: "Suspicious user agent or request patterns",
    condition: (logs) => {
      const botSignatures = ["bot", "crawler", "spider", "scraper"];
      return logs.some((log) =>
        botSignatures.some((sig) => log.user_agent?.toLowerCase().includes(sig))
      );
    },
    severity: "low",
    action: "log",
  },
];

export class AbuseDetectionService {
  private supabase = createClient();

  async checkForAbuse(
    identifier: string,
    identifierType: "ip" | "user_id"
  ): Promise<AbusePattern[]> {
    // Get recent logs for this identifier
    const logs = await this.getRecentLogs(identifier, identifierType);

    // Check each abuse pattern
    const detectedPatterns = ABUSE_PATTERNS.filter((pattern) =>
      pattern.condition(logs)
    );

    // Process detected patterns
    for (const pattern of detectedPatterns) {
      await this.handleAbusePattern(pattern, identifier, identifierType);
    }

    return detectedPatterns;
  }

  private async getRecentLogs(
    identifier: string,
    identifierType: "ip" | "user_id"
  ): Promise<RequestLogEntry[]> {
    const column = identifierType === "ip" ? "ip_address" : "user_id";
    const since = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    const { data } = await this.supabase
      .from("request_logs")
      .select("*")
      .eq(column, identifier)
      .gte("timestamp", since.toISOString())
      .order("timestamp", { ascending: false });

    return data || [];
  }

  private async handleAbusePattern(
    pattern: AbusePattern,
    identifier: string,
    identifierType: "ip" | "user_id"
  ): Promise<void> {
    // Log the abuse detection
    console.warn(`Abuse detected: ${pattern.name}`, {
      identifier,
      identifierType,
      pattern: pattern.id,
      severity: pattern.severity,
    });

    // Store abuse incident
    await this.supabase.from("abuse_incidents").insert({
      pattern_id: pattern.id,
      pattern_name: pattern.name,
      identifier,
      identifier_type: identifierType,
      severity: pattern.severity,
      action_taken: pattern.action,
      timestamp: new Date().toISOString(),
    });

    // Take appropriate action
    switch (pattern.action) {
      case "block":
        await this.blockIdentifier(identifier, identifierType);
        break;
      case "alert":
        await this.sendAlert(pattern, identifier);
        break;
      case "escalate":
        await this.escalateIncident(pattern, identifier);
        break;
    }
  }

  private async blockIdentifier(
    identifier: string,
    identifierType: "ip" | "user_id"
  ): Promise<void> {
    // Add to block list
    await this.supabase.from("blocked_identifiers").insert({
      identifier,
      identifier_type: identifierType,
      blocked_at: new Date().toISOString(),
      blocked_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      reason: "Automated abuse detection",
    });
  }

  private async sendAlert(
    pattern: AbusePattern,
    identifier: string
  ): Promise<void> {
    // Send to monitoring system (e.g., Discord, Slack, email)
    // Implementation depends on your preferred alerting method
    console.error(`SECURITY ALERT: ${pattern.name} detected for ${identifier}`);
  }

  private async escalateIncident(
    pattern: AbusePattern,
    identifier: string
  ): Promise<void> {
    // High-severity incident - immediate action required
    await this.blockIdentifier(identifier, "ip");
    await this.sendAlert(pattern, identifier);

    // Could also:
    // - Send SMS/page to admin
    // - Create incident in ticketing system
    // - Automatically scale down expensive endpoints
  }
}
```

### Phase 3: Monitoring Dashboard (Week 3)

#### Admin Dashboard for Request Monitoring

```typescript
// api/admin/monitoring/route.ts
import { AbuseDetectionService } from "../../../lib/services/abuseDetection";

export async function GET(request: NextRequest) {
  // Require admin authentication
  const authContext = await getAuthContext(request);
  if (authContext.profile?.subscription_tier !== "enterprise") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const abuseService = new AbuseDetectionService();

  // Get monitoring data
  const [
    recentRequests,
    topEndpoints,
    topUsers,
    topIPs,
    abuseIncidents,
    costMetrics,
  ] = await Promise.all([
    getRecentRequests(supabase),
    getTopEndpoints(supabase),
    getTopUsers(supabase),
    getTopIPs(supabase),
    getAbuseIncidents(supabase),
    getCostMetrics(supabase),
  ]);

  return NextResponse.json({
    summary: {
      total_requests_24h: recentRequests.length,
      unique_users_24h: new Set(recentRequests.map((r) => r.user_id)).size,
      unique_ips_24h: new Set(recentRequests.map((r) => r.ip_address)).size,
      total_cost_24h: recentRequests.reduce(
        (sum, r) => sum + (r.estimated_cost_usd || 0),
        0
      ),
      avg_response_time:
        recentRequests.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) /
        recentRequests.length,
    },
    endpoints: topEndpoints,
    users: topUsers,
    ips: topIPs,
    abuse_incidents: abuseIncidents,
    cost_metrics: costMetrics,
  });
}

async function getRecentRequests(supabase: any) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("request_logs")
    .select("*")
    .gte("timestamp", since.toISOString());
  return data || [];
}

async function getTopEndpoints(supabase: any) {
  const { data } = await supabase
    .from("request_logs")
    .select("endpoint, estimated_cost_usd, response_time_ms")
    .gte("timestamp", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const endpointStats = (data || []).reduce((acc: any, log: any) => {
    if (!acc[log.endpoint]) {
      acc[log.endpoint] = {
        endpoint: log.endpoint,
        requests: 0,
        total_cost: 0,
        avg_response_time: 0,
        total_response_time: 0,
      };
    }

    acc[log.endpoint].requests++;
    acc[log.endpoint].total_cost += log.estimated_cost_usd || 0;
    acc[log.endpoint].total_response_time += log.response_time_ms || 0;

    return acc;
  }, {});

  return Object.values(endpointStats)
    .map((stat: any) => ({
      ...stat,
      avg_response_time: stat.total_response_time / stat.requests,
    }))
    .sort((a: any, b: any) => b.total_cost - a.total_cost);
}
```

## Implementation Plan

### Week 1: Basic Request Logging

#### Day 1-2: Database Setup

- [ ] **Create request logging tables**
  ```sql
  -- Create request_logs, abuse_incidents, blocked_identifiers tables
  -- Set up indexes for performance
  -- Create cleanup functions for old data
  ```
- [ ] **Create logging middleware**
  ```typescript
  // Implement withRequestLogging middleware
  // Add cost estimation functions
  // Add IP geolocation utilities
  ```

#### Day 3-5: Middleware Integration

- [ ] **Add logging to all API endpoints**
  ```typescript
  // Wrap all route handlers with withRequestLogging
  // Configure logging levels per endpoint
  // Test performance impact
  ```
- [ ] **Verify logging functionality**
  - Check logs are being written correctly
  - Verify performance metrics accuracy
  - Test different request scenarios

#### Day 6-7: Basic Monitoring

- [ ] **Create simple monitoring dashboard**
  ```typescript
  // Basic admin endpoint to view recent requests
  // Simple metrics aggregation
  // Real-time log streaming capability
  ```

### Week 2: Abuse Detection

#### Day 1-3: Detection Engine

- [ ] **Implement abuse detection service**
  ```typescript
  // Create AbuseDetectionService class
  // Implement pattern matching algorithms
  // Add automated response actions
  ```
- [ ] **Create abuse pattern definitions**
  ```typescript
  // Define rate limiting patterns
  // Geographic anomaly detection
  // Cost spike detection
  // Bot behavior patterns
  ```

#### Day 4-5: Integration & Testing

- [ ] **Integrate abuse detection with logging**
  - Run detection on each request
  - Store abuse incidents
  - Implement blocking mechanisms
- [ ] **Test abuse detection**
  - Simulate various abuse scenarios
  - Verify detection accuracy
  - Test automated responses

#### Day 6-7: Alerting System

- [ ] **Implement real-time alerting**
  - Discord/Slack webhooks for alerts
  - Email notifications for critical incidents
  - SMS alerts for severe abuse (optional)

### Week 3: Advanced Monitoring

#### Day 1-3: Dashboard Development

- [ ] **Build comprehensive admin dashboard**
  ```typescript
  // Real-time metrics display
  // Historical trend analysis
  // Cost breakdown by user/endpoint
  // Geographic request distribution
  ```

#### Day 4-5: Analytics & Insights

- [ ] **Implement advanced analytics**
  - Usage pattern analysis
  - Cost optimization recommendations
  - Performance bottleneck identification
  - Business intelligence metrics

#### Day 6-7: Automation & Optimization

- [ ] **Add automated optimizations**
  - Dynamic rate limiting based on patterns
  - Automatic cost alerts and limiting
  - Performance optimization suggestions

## Success Criteria

### Week 1: Basic Logging

- [ ] All API endpoints logging requests to database
- [ ] <10ms performance overhead from logging
- [ ] Request logs include all required metadata
- [ ] Basic monitoring dashboard functional

### Week 2: Abuse Detection

- [ ] Abuse detection running on all requests
- [ ] <5% false positive rate for abuse detection
- [ ] Automatic blocking of high-risk IPs
- [ ] Real-time alerts for critical incidents

### Week 3: Advanced Monitoring

- [ ] Comprehensive admin dashboard operational
- [ ] Historical trend analysis available
- [ ] Cost attribution by user and endpoint
- [ ] Actionable optimization recommendations

## Risk Mitigation

### Performance Impact

- **Risk**: Logging adds latency to requests
- **Mitigation**: Async logging, database optimization, performance monitoring

### Storage Costs

- **Risk**: Request logs consume significant storage
- **Mitigation**: Data retention policies, log aggregation, efficient schemas

### False Positives

- **Risk**: Legitimate users blocked by abuse detection
- **Mitigation**: Careful pattern tuning, manual review process, whitelist capability

### Privacy Concerns

- **Risk**: Request logging may capture sensitive data
- **Mitigation**: Data sanitization, PII redaction, compliance with privacy laws

## Cost Analysis

### Database Storage

```typescript
// Estimated storage requirements:
// 1000 requests/day × 1KB per log = 1MB/day = 365MB/year
// Supabase cost: ~$0.10/month for storage

// With 10,000 requests/day:
// 10MB/day = 3.6GB/year
// Supabase cost: ~$1/month for storage
```

### Monitoring Infrastructure

- **Database storage**: $0.10-1/month
- **Alerting services**: $5-20/month (Discord/Slack webhooks free)
- **Analytics processing**: Minimal (runs on existing functions)

### Development Investment

- **Implementation time**: 3 weeks (1 developer)
- **Testing and optimization**: 1 week
- **Total investment**: ~$2,000-4,000 in development time

### ROI Analysis

- **Risk prevented**: $10,000+ in potential abuse costs
- **Insights gained**: Invaluable for product optimization
- **Security improvement**: Dramatic reduction in attack surface

---

## Conclusion

Comprehensive request monitoring and abuse detection is **critical** for operating a production AI application on serverless infrastructure. Without it, you're operating blind with unlimited cost and security exposure.

**Impact**: This system provides the visibility and protection needed to operate safely at scale while gathering invaluable insights for optimization and growth.

**Priority**: Must be implemented immediately after removing broken rate limiting to restore security posture.

**Timeline**: 3 weeks for full implementation, with basic protection available after week 1.
