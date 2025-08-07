// src/app/api/chat/clear-all/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';

async function clearAllHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
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
      return NextResponse.json({
        success: true,
        message: 'No conversations to clear',
        deletedCount: 0
      });
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

    logger.info('All conversations cleared successfully', { 
      userId: user!.id, 
      deletedCount: sessionIds.length 
    });

    return NextResponse.json({
      success: true,
      message: 'All conversations cleared successfully',
      deletedCount: sessionIds.length
    });

  } catch (error) {
    logger.error('Clear all conversations error:', error);
    return handleError(error);
  }
}

// Apply middleware to handler
export const DELETE = withProtectedAuth(clearAllHandler);
