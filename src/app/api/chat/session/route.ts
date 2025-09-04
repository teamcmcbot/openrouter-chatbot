// src/app/api/chat/session/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { handleError } from '../../../../../lib/utils/errors';

interface SessionUpdateData {
  title?: string;
  message_count?: number;
  total_tokens?: number;
  last_model?: string;
  last_message_preview?: string;
  last_message_timestamp?: string;
  updated_at: string;
}

async function getSessionHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

  logger.debug('[GET] /api/chat/session - Request received', { 
      url: request.url, 
      userId: user!.id 
    });

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');
  logger.debug('[GET] Session ID param', { sessionId });

    if (!sessionId) {
      logger.warn('[GET] Missing session ID');
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400, headers: { 'x-request-id': requestId } }
      );
    }

    // Get the specific chat session for the authenticated user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user!.id)
      .single();

    if (sessionError) {
      logger.error('[GET] Session lookup error', { error: sessionError });
    }
    if (!session) {
      logger.warn('[GET] Session not found or access denied', { userId: user!.id, sessionId });
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404, headers: { 'x-request-id': requestId } }
      );
    }

    const durationMs = Date.now() - t0;
    logger.info('[GET] Session found', { sessionId: session.id, requestId, durationMs });
    return NextResponse.json({
      session: session
    }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('[GET] Get session error', { error, requestId });
  return handleError(error, requestId);
  }
}

async function postSessionHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

  logger.debug('[POST] /api/chat/session - Request received', { userId: user!.id });

    const sessionData = await request.json();
    const { id: sessionId, title, ...otherFields } = sessionData;
    // Deprecation: ignore legacy is_active in payload, log once per request
    if (Object.prototype.hasOwnProperty.call(sessionData, 'is_active')) {
      logger.warn('[POST] Deprecated field is_active received and ignored', {
        sessionId,
        userId: user!.id,
      });
    }
  logger.debug('[POST] Session update payload', { sessionData });

    if (!sessionId) {
      logger.warn('[POST] Missing session ID');
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400, headers: { 'x-request-id': requestId } }
      );
    }

    // Verify session exists and belongs to authenticated user
    const { data: existingSession, error: checkError } = await supabase
      .from('chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', user!.id)
      .single();

    if (checkError) {
      logger.error('[POST] Session lookup error', { error: checkError });
    }
    if (!existingSession) {
      logger.warn('[POST] Session not found or access denied', { userId: user!.id, sessionId });
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404, headers: { 'x-request-id': requestId } }
      );
    }

    // Regular session update (non-active status changes)
    const updateData: SessionUpdateData = {
      updated_at: new Date().toISOString()
    };

    // Only update title if provided
    if (title !== undefined) {
      updateData.title = title;
    }

  // Note: legacy is_active updates are ignored; active selection is client-side only

    // Add any other allowed fields for session updates
    // Note: user_id cannot be changed, and id cannot be changed
    if (otherFields.message_count !== undefined) {
      updateData.message_count = otherFields.message_count;
    }
    if (otherFields.total_tokens !== undefined) {
      updateData.total_tokens = otherFields.total_tokens;
    }
    if (otherFields.last_model !== undefined) {
      updateData.last_model = otherFields.last_model;
    }
    if (otherFields.last_message_preview !== undefined) {
      updateData.last_message_preview = otherFields.last_message_preview;
    }
    if (otherFields.last_message_timestamp !== undefined) {
      updateData.last_message_timestamp = otherFields.last_message_timestamp;
    }

    logger.info('[POST] Updating session', { sessionId, updateData });
    const { data: updatedSession, error: updateError } = await supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', user!.id) // Double-check user ownership
      .select()
      .single();

    if (updateError) {
      logger.error('[POST] Session update error', { error: updateError });
      throw updateError;
    }

    const durationMs = Date.now() - t0;
  logger.info('[POST] Session updated successfully', { requestId, durationMs });
    return NextResponse.json({
      session: updatedSession,
      success: true
    }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('[POST] Update session error', { error, requestId });
  return handleError(error, requestId);
  }
}

// Apply middleware to handlers with TierC rate limiting
export const GET = withProtectedAuth(
  withTieredRateLimit(getSessionHandler, { tier: 'tierC' })
);
export const POST = withProtectedAuth(
  withTieredRateLimit(postSessionHandler, { tier: 'tierC' })
);
