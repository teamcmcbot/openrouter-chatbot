import { NextRequest, NextResponse } from 'next/server';
import { withEnhancedAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../../lib/utils/logger';
import { deriveAnonHash } from '../../../../../../lib/utils/crypto';
import { createClient as createServerSupabaseClient } from '../../../../../../lib/supabase/server';

type ErrorPayload = {
  anonymous_session_id: string;
  timestamp: string; // ISO
  model: string;
  http_status?: number;
  error_code?: string;
  error_message?: string;
  provider?: string;
  provider_request_id?: string;
  completion_id?: string;
  metadata?: Record<string, unknown>;
};

async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: ErrorPayload | null = null;
  try {
    body = (await req.json()) as ErrorPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body.anonymous_session_id !== 'string' || typeof body.model !== 'string' || typeof body.timestamp !== 'string') {
    return NextResponse.json({ error: 'Missing required fields: anonymous_session_id, model, timestamp' }, { status: 400 });
  }

  const sessionId = body.anonymous_session_id.trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'anonymous_session_id is required' }, { status: 400 });
  }

  let anonHash: string;
  try {
    anonHash = await deriveAnonHash(sessionId);
  } catch (e) {
    logger.error('Anonymous error: failed to derive anon_hash', e);
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Sanitize and cap fields per SQL contract
  const safePayload = {
    anon_hash: anonHash,
    model: body.model.slice(0, 100),
    timestamp: body.timestamp,
    http_status: Number.isFinite(body.http_status) ? Math.trunc(body.http_status as number) : undefined,
    error_code: body.error_code ? String(body.error_code).slice(0, 120) : undefined,
    error_message: body.error_message ? String(body.error_message).slice(0, 300) : undefined,
    provider: body.provider ? String(body.provider).slice(0, 60) : undefined,
    provider_request_id: body.provider_request_id ? String(body.provider_request_id).slice(0, 120) : undefined,
    completion_id: body.completion_id ? String(body.completion_id).slice(0, 120) : undefined,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
  };

  try {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('ingest_anonymous_error', {
      p_payload: safePayload,
    } as unknown as { p_payload: unknown });

    if (error) {
      logger.warn('Anonymous error RPC failed', { error: String(error.message || error) });
      return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data ?? null });
  } catch (e) {
    logger.error('Anonymous error: exception during RPC', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export const POST = withEnhancedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
