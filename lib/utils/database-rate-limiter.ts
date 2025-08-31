// lib/utils/database-rate-limiter.ts
import { createClient } from "@supabase/supabase-js";
import { logger } from './logger';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

/**
 * Database-based rate limiter (slower than Redis but free)
 * Uses Supabase for persistent state in serverless environment
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 3600000
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    // First, clean up old entries
    await supabase
      .from("rate_limit_entries")
      .delete()
      .lt("created_at", windowStart.toISOString());

    // Count current requests in window
    const { count: totalRequests } = await supabase
      .from("rate_limit_entries")
      .select("*", { count: "exact", head: true })
      .eq("rate_limit_key", key)
      .gte("created_at", windowStart.toISOString());

    const currentCount = totalRequests || 0;

    if (currentCount >= limit) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetTime: now.getTime() + windowMs,
        totalRequests: currentCount,
      };
    }

    // Add current request
    await supabase.from("rate_limit_entries").insert({
      rate_limit_key: key,
      created_at: now.toISOString(),
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - currentCount - 1),
      resetTime: now.getTime() + windowMs,
      totalRequests: currentCount + 1,
    };
  } catch (error) {
    logger.error('Database rate limit error', {
      error,
      key,
      limit,
      windowMs,
    });
    
    // Fallback: Allow request but log error
    return {
      allowed: true,
      remaining: limit,
      resetTime: now.getTime() + windowMs,
      totalRequests: 0,
    };
  }
}

/*
-- SQL to create the rate limiting table in Supabase:

CREATE TABLE rate_limit_entries (
  id SERIAL PRIMARY KEY,
  rate_limit_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_rate_limit_key_time (rate_limit_key, created_at)
);

-- Auto cleanup old entries (optional)
SELECT cron.schedule('rate-limit-cleanup', '0 * * * *', 
  'DELETE FROM rate_limit_entries WHERE created_at < NOW() - INTERVAL ''2 hours'';'
);
*/
