import { NextRequest, NextResponse } from 'next/server';
import { withEnhancedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { logger } from '../../../../../lib/utils/logger';
import { deriveAnonHash } from '../../../../../lib/utils/crypto';
import { createClient as createServerSupabaseClient } from '../../../../../lib/supabase/server';

type UsageEvent = {
  timestamp: string; // ISO
  type: 'message_sent' | 'completion_received';
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  elapsed_ms?: number;
};

type IngestPayload = {
  anonymous_session_id: string; // raw UUID, never stored
  events: UsageEvent[];
};

async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: IngestPayload | null = null;
  try {
    body = (await req.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body.anonymous_session_id !== 'string' || !Array.isArray(body.events)) {
    return NextResponse.json({ error: 'Missing required fields: anonymous_session_id, events' }, { status: 400 });
  }

  // Basic guards
  const sessionId = body.anonymous_session_id.trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'anonymous_session_id is required' }, { status: 400 });
  }
  // Cap events length client-side too
  if (body.events.length === 0) {
    return NextResponse.json({ error: 'events array must not be empty' }, { status: 400 });
  }
  if (body.events.length > 50) {
    return NextResponse.json({ error: 'too_many_events' }, { status: 413 });
  }

  // Derive anon_hash server-side
  let anonHash: string;
  try {
    anonHash = await deriveAnonHash(sessionId);
  } catch (e) {
    logger.error('Anonymous usage: failed to derive anon_hash', e);
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Sanitize events minimally (types/numbers; trimming models)
  const safeEvents: UsageEvent[] = body.events.map((e) => ({
    timestamp: String(e.timestamp || ''),
    type: e.type === 'message_sent' || e.type === 'completion_received' ? e.type : 'message_sent',
    model: typeof e.model === 'string' ? e.model.slice(0, 100) : undefined,
    input_tokens: Number.isFinite(e.input_tokens) ? Math.max(0, Math.trunc(e.input_tokens as number)) : undefined,
    output_tokens: Number.isFinite(e.output_tokens) ? Math.max(0, Math.trunc(e.output_tokens as number)) : undefined,
    elapsed_ms: Number.isFinite(e.elapsed_ms) ? Math.max(0, Math.trunc(e.elapsed_ms as number)) : undefined,
  }));

  try {
    const sb = await createServerSupabaseClient();
    const { data, error } = await sb.rpc('ingest_anonymous_usage', {
      p_payload: {
        anon_hash: anonHash,
        events: safeEvents,
      },
    } as unknown as { p_payload: unknown });

    if (error) {
      logger.warn('Anonymous usage RPC failed', { error: String(error.message || error) });
      return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data ?? null });
  } catch (e) {
    logger.error('Anonymous usage: exception during RPC', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export const POST = withEnhancedAuth(
  withTieredRateLimit(handler, { tier: 'tierC' })
);
