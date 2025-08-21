import { NextRequest, NextResponse } from "next/server";
import { withEnhancedAuth } from "../../../../../lib/middleware/auth";
import { withRedisRateLimit } from "../../../../../lib/middleware/redisRateLimitMiddleware";
import { logger } from "../../../../../lib/utils/logger";
import { createClient as createServerSupabaseClient } from "../../../../../lib/supabase/server";
import type { AuthContext } from "../../../../../lib/types/auth";

type CtaEvent = {
  event?: string; // default: 'cta_click'
  page: string; // e.g., 'landing'
  cta_id: string; // e.g., 'start_chat', 'learn_more', 'try_it_now'
  location?: string; // e.g., 'hero', 'footerBanner'
  meta?: Record<string, unknown>;
};

async function ctaHandler(req: NextRequest, authContext: AuthContext) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }
  let payload: CtaEvent | null = null;
  try {
    payload = (await req.json()) as CtaEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload || typeof payload.cta_id !== "string" || typeof payload.page !== "string") {
    return NextResponse.json({ error: "Missing required fields: cta_id, page" }, { status: 400 });
  }

  const authFlag = !!authContext?.isAuthenticated && !!authContext?.user;

  // Derive coarse IP for anonymous rate key/debug only (not returned)
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() : req.headers.get("x-real-ip") || "unknown";

  // Log the event
  logger.info("CTA click event", {
    event: payload.event || "cta_click",
    page: payload.page,
    cta_id: payload.cta_id,
    location: payload.location,
    auth: authFlag,
    ip,
    meta: payload.meta,
  });

  // Persist to DB (best-effort, non-blocking response semantics)
  try {
    const sb = await createServerSupabaseClient();
    const ipHash = typeof ip === "string" && ip !== "unknown" ? ip : null; // keep raw minimal; hash if needed later
    const { error } = await sb.rpc("ingest_cta_event", {
      p_page: payload.page,
      p_cta_id: payload.cta_id,
      p_location: payload.location ?? null,
      p_is_authenticated: authFlag,
      p_user_id: authContext?.user?.id ?? null,
      p_ip_hash: ipHash,
      p_meta: payload.meta ?? null,
    });
    if (error) {
      logger.warn("CTA event DB insert failed", { error: String(error?.message || error) });
    }
  } catch (e) {
    logger.warn("CTA event DB insert exception", { error: String(e) });
  }

  return NextResponse.json({ ok: true, auth: authFlag });
}

export const POST = withEnhancedAuth(
  withRedisRateLimit(ctaHandler)
);
