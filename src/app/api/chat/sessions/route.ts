// src/app/api/chat/sessions/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

async function getSessionsHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

  logger.debug('Get sessions request', { userId: user!.id, requestId });

    // Get user's chat sessions (without messages for performance)
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (sessionsError) {
      throw sessionsError;
    }

    const durationMs = Date.now() - t0;
    logger.info('chat.sessions.get.complete', {
      requestId,
      route: '/api/chat/sessions',
      ctx: { count: sessions?.length || 0, durationMs },
    });
    return NextResponse.json({
      sessions: sessions || [],
      count: sessions?.length || 0
  }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Get sessions error:', error);
  return handleError(error, requestId, '/api/chat/sessions');
  }
}

async function postSessionsHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

  logger.debug('Create session request', { userId: user!.id, requestId });

    const sessionData = await request.json();

    // Create new chat session
    const { data: newSession, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        id: sessionData.id,
        user_id: user!.id,
        title: sessionData.title || 'New Chat',
        message_count: 0,
        total_tokens: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      throw sessionError;
    }

    const durationMs = Date.now() - t0;
    logger.info('chat.sessions.post.complete', {
      requestId,
      route: '/api/chat/sessions',
      ctx: { created: !!newSession, durationMs },
    });
    return NextResponse.json({
      session: newSession,
      success: true
  }, { status: 201, headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Create session error:', error);
  return handleError(error, requestId, '/api/chat/sessions');
  }
}

async function deleteSessionsHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Delete session request', { userId: user!.id });

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400, headers: { 'x-request-id': requestId } }
      );
    }

    // Delete messages first (due to foreign key constraint)
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    if (messagesError) {
      throw messagesError;
    }

    // Delete the session (with user validation)
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user!.id); // Ensure user can only delete their own sessions

    if (sessionError) {
      throw sessionError;
    }

    const durationMs = Date.now() - t0;
    logger.info('chat.sessions.delete.complete', {
      requestId,
      route: '/api/chat/sessions',
  ctx: { durationMs },
    });
    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
  }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Delete session error:', error);
  return handleError(error, requestId, '/api/chat/sessions');
  }
}

// Apply middleware to handlers with TierC rate limiting
export const GET = withProtectedAuth(
  withTieredRateLimit(getSessionsHandler, { tier: 'tierC' }),
  { enforceBan: false }
);
export const POST = withProtectedAuth(
  withTieredRateLimit(postSessionsHandler, { tier: 'tierC' }),
  { enforceBan: false }
);
export const DELETE = withProtectedAuth(
  withTieredRateLimit(deleteSessionsHandler, { tier: 'tierC' }),
  { enforceBan: false }
);
