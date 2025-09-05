// src/app/api/chat/clear-all/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';
import { handleError } from '../../../../../lib/utils/errors';

async function clearAllHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Clear all conversations request', { userId: user!.id });

    // First, get all session IDs for the user
    const { data: userSessions, error: getSessionsError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user!.id);

    if (getSessionsError) {
      logger.error('Error getting user sessions:', getSessionsError);
      throw getSessionsError;
    }

    const sessionIds = userSessions?.map(session => session.id) || [];

    if (sessionIds.length === 0) {
      const durationMs = Date.now() - t0;
      logger.info('chat.clear-all.complete', { requestId, route: '/api/chat/clear-all', ctx: { deletedCount: 0, durationMs } });
      return NextResponse.json({
        success: true,
        message: 'No conversations to clear',
        deletedCount: 0
      }, { headers: { 'x-request-id': requestId } });
    }

    // Delete all messages for the user's sessions
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .delete()
      .in('session_id', sessionIds);

    if (messagesError) {
      logger.error('Error deleting messages:', messagesError);
      throw messagesError;
    }

    // Delete all sessions for the user
    const { error: sessionsError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('user_id', user!.id);

    if (sessionsError) {
      logger.error('Error deleting sessions:', sessionsError);
      throw sessionsError;
    }

    const durationMs = Date.now() - t0;
    logger.info('All conversations cleared successfully', { 
      deletedCount: sessionIds.length,
      requestId,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      message: 'All conversations cleared successfully',
      deletedCount: sessionIds.length
    }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Clear all conversations error:', error);
  return handleError(error, requestId, '/api/chat/clear-all');
  }
}

// Apply middleware to handler with TierC rate limiting
export const DELETE = withProtectedAuth(
  withTieredRateLimit(clearAllHandler, { tier: 'tierC' }),
  { enforceBan: false }
);
